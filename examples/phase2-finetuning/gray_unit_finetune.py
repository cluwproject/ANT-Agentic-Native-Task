# ============================================================================
# ANT-CYBER-CORPS — GRAY UNIT FINE-TUNING (LoRA / QLoRA)
# ============================================================================
# Base Model : qwen2.5-coder:1.5b (atau 3b jika GPU V100 16GB)
# Method     : QLoRA 4-bit (bitsandbytes)
# Target     : 5 GRAY Unit spesialis keamanan siber
# Platform   : Kaggle Notebook (GPU T4/P100/V100)
# ============================================================================

# ── INSTALL DEPENDENCIES ─────────────────────────────────────────────────────
!pip install -q transformers datasets peft trl accelerate bitsandbytes sentencepiece

import os, json, torch
from datasets import Dataset
from transformers import (
    AutoModelForCausalLM,
    AutoTokenizer,
    TrainingArguments,
    BitsAndBytesConfig,
)
from peft import LoraConfig, get_peft_model, TaskType
from trl import SFTTrainer

# ── CONFIGURATION ─────────────────────────────────────────────────────────────
BASE_MODEL = "Qwen/Qwen2.5-Coder-1.5B-Instruct"
OUTPUT_DIR = "/kaggle/working/ant-gray-unit"

# Pilih unit yang ingin kamu training (1-5)
GRAY_UNIT_ID   = 1
GRAY_UNIT_NAME = "Memory-Logic-Guardian"

GRAY_UNIT_DESCRIPTIONS = {
    1: "Memory & Logic Guardian — Deteksi buffer overflow, race condition, memory leak",
    2: "Injection Sifter       — Deteksi SQL injection, XSS, command injection",
    3: "Auth & Identity Guard  — Deteksi IDOR, JWT flaw, broken auth, privilege escalation",
    4: "Supply Chain Sentinel  — Deteksi CVE dependencies, outdated packages, typosquatting",
    5: "Cloud & Config Auditor — Deteksi exposed secrets, IAM misconfiguration, .env leaks",
}
print(f"[CONFIG] Training GRAY-{GRAY_UNIT_ID}: {GRAY_UNIT_DESCRIPTIONS[GRAY_UNIT_ID]}")

# ── DATASET FORMAT ────────────────────────────────────────────────────────────
# Setiap sample harus mengikuti format ini.
# Minimum 500 sample per unit untuk hasil yang baik.
# Format: {"instruction": "...", "input": "<kode yang diaudit>", "output": "<laporan temuan>"}

SAMPLE_DATASET_GRAY1 = [
    {
        "instruction": "Kamu adalah GRAY-1, Memory & Logic Guardian ANT-CYBER-CORPS. Audit kode berikut dan laporkan temuan keamanan memori.",
        "input": """
function processData(userInput) {
    let buffer = new Buffer(10);
    buffer.write(userInput);  // Tidak ada validasi panjang input
    return buffer;
}
""",
        "output": """[GRAY-1 REPORT] TEMUAN: Buffer Overflow Risk
SEVERITY  : HIGH
LOCATION  : processData() — line 2-3
EVIDENCE  : Buffer dialokasikan 10 bytes tapi `userInput` tidak divalidasi panjangnya.
            Input > 10 chars akan overwrite memori di luar buffer.
FIX       : Validasi `userInput.length <= 10` sebelum write, atau gunakan `Buffer.alloc()`.
CVE-REF   : CWE-120 (Buffer Copy without Checking Size)"""
    },
    {
        "instruction": "Kamu adalah GRAY-1, Memory & Logic Guardian ANT-CYBER-CORPS. Audit kode berikut dan laporkan temuan keamanan memori.",
        "input": """
let cache = {};
async function fetchUser(id) {
    if (!cache[id]) {
        cache[id] = await db.query(`SELECT * FROM users WHERE id = ${id}`);
    }
    return cache[id];
}
""",
        "output": """[GRAY-1 REPORT] TEMUAN: Memory Leak + SQL Injection
SEVERITY  : CRITICAL
LOCATION  : fetchUser() — cache object + query string
EVIDENCE  : 1. `cache` object tidak pernah dibersihkan — memory leak tak terbatas.
               Setiap user ID unik akan terus menumpuk di memori.
            2. Template literal langsung di query — SQL injection vector.
FIX       : Gunakan LRU cache dengan TTL, gunakan parameterized query (id sebagai $1).
CVE-REF   : CWE-401 (Memory Leak), CWE-89 (SQL Injection)"""
    },
    # ── TAMBAHKAN LEBIH BANYAK SAMPLE DI SINI ──
    # Target minimum: 500 sample per unit
]

# ── LOAD & FORMAT DATASET ─────────────────────────────────────────────────────
def format_prompt(sample: dict) -> str:
    """Format dataset menjadi prompt Qwen2.5 Instruct format."""
    return (
        f"<|im_start|>system\n{sample['instruction']}<|im_end|>\n"
        f"<|im_start|>user\n{sample['input']}<|im_end|>\n"
        f"<|im_start|>assistant\n{sample['output']}<|im_end|>"
    )

# Ganti dengan dataset aslimu saat sudah siap
raw_dataset = SAMPLE_DATASET_GRAY1
dataset = Dataset.from_list([{"text": format_prompt(s)} for s in raw_dataset])
print(f"[DATASET] Total samples: {len(dataset)}")

# ── LOAD MODEL (QLoRA 4-bit) ──────────────────────────────────────────────────
bnb_config = BitsAndBytesConfig(
    load_in_4bit=True,
    bnb_4bit_quant_type="nf4",
    bnb_4bit_compute_dtype=torch.float16,
    bnb_4bit_use_double_quant=True,
)

tokenizer = AutoTokenizer.from_pretrained(BASE_MODEL, trust_remote_code=True)
tokenizer.pad_token = tokenizer.eos_token

model = AutoModelForCausalLM.from_pretrained(
    BASE_MODEL,
    quantization_config=bnb_config,
    device_map="auto",
    trust_remote_code=True,
)
model.config.use_cache = False
print(f"[MODEL] Loaded: {BASE_MODEL}")

# ── LORA CONFIG ───────────────────────────────────────────────────────────────
lora_config = LoraConfig(
    task_type=TaskType.CAUSAL_LM,
    r=16,               # Rank — naikkan ke 32 jika GPU VRAM > 16GB
    lora_alpha=32,
    lora_dropout=0.05,
    bias="none",
    target_modules=["q_proj", "k_proj", "v_proj", "o_proj"],
)
model = get_peft_model(model, lora_config)
model.print_trainable_parameters()

# ── TRAINING ──────────────────────────────────────────────────────────────────
training_args = TrainingArguments(
    output_dir=OUTPUT_DIR,
    num_train_epochs=3,
    per_device_train_batch_size=2,
    gradient_accumulation_steps=4,
    learning_rate=2e-4,
    fp16=True,
    logging_steps=10,
    save_strategy="epoch",
    optim="paged_adamw_32bit",
    report_to="none",
)

trainer = SFTTrainer(
    model=model,
    train_dataset=dataset,
    args=training_args,
    tokenizer=tokenizer,
    dataset_text_field="text",
    max_seq_length=2048,
    packing=False,
)

print(f"[TRAINING] Memulai fine-tuning GRAY-{GRAY_UNIT_ID}...")
trainer.train()
print(f"[DONE] Training selesai!")

# ── SAVE MODEL ────────────────────────────────────────────────────────────────
save_path = f"{OUTPUT_DIR}/gray-{GRAY_UNIT_ID}-{GRAY_UNIT_NAME}"
trainer.save_model(save_path)
tokenizer.save_pretrained(save_path)
print(f"[SAVED] Model tersimpan di: {save_path}")

# ── TEST INFERENCE ────────────────────────────────────────────────────────────
def test_gray_unit(code_snippet: str) -> str:
    prompt = format_prompt({
        "instruction": f"Kamu adalah GRAY-{GRAY_UNIT_ID}. Audit kode berikut.",
        "input": code_snippet,
        "output": ""
    }).rstrip("<|im_end|>")

    inputs = tokenizer(prompt, return_tensors="pt").to(model.device)
    with torch.no_grad():
        outputs = model.generate(
            **inputs,
            max_new_tokens=256,
            temperature=0.1,
            do_sample=True,
        )
    return tokenizer.decode(outputs[0][inputs['input_ids'].shape[1]:], skip_special_tokens=True)

# Test dengan kode contoh
test_code = """
let buf = Buffer.allocUnsafe(64);
buf.write(req.body.input);
"""
result = test_gray_unit(test_code)
print(f"\n[TEST RESULT]\n{result}")
