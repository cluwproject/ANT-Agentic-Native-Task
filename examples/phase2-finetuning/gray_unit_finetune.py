# ============================================================================
# ANT-CYBER-CORPS — GRAY UNIT FINE-TUNING (LoRA / QLoRA)
# ============================================================================
# Base Model : qwen2.5-coder:1.5b
# Method     : QLoRA 4-bit (bitsandbytes)
# Target     : 5 GRAY Unit spesialis keamanan siber
# Platform   : Kaggle Notebook (GPU T4/P100/V100)
# ============================================================================

# ── INSTALL DEPENDENCIES ─────────────────────────────────────────────────────
!pip install -q transformers datasets peft trl accelerate bitsandbytes sentencepiece scikit-learn

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
from sklearn.model_selection import train_test_split

# ── CONFIGURATION ─────────────────────────────────────────────────────────────
BASE_MODEL = "Qwen/Qwen2.5-Coder-1.5B-Instruct"
OUTPUT_DIR = "/kaggle/working/ant-gray-unit"

GRAY_UNIT_ID   = 1
GRAY_UNIT_NAME = "Memory-Logic-Guardian"

# ── LOAD & SPLIT DATASET ──────────────────────────────────────────────────────
# Format data: {"instruction": "...", "input": "...", "output": "..."}
# Ganti dengan path ke dataset yang diupload ke Kaggle
DATASET_PATH = f"/kaggle/input/ant-gray-units-dataset/dataset_gray-{GRAY_UNIT_ID}.jsonl"

def format_prompt(sample: dict) -> str:
    return (
        f"<|im_start|>system\n{sample['instruction']}<|im_end|>\n"
        f"<|im_start|>user\n{sample['input']}<|im_end|>\n"
        f"<|im_start|>assistant\n{sample['output']}<|im_end|>"
    )

with open(DATASET_PATH, "r") as f:
    raw_data = [json.loads(line) for line in f]

# Split Train (80%) dan Eval (20%) untuk mencegah overfitting
train_data, eval_data = train_test_split(raw_data, test_size=0.2, random_state=42)

train_dataset = Dataset.from_list([{"text": format_prompt(s)} for s in train_data])
eval_dataset = Dataset.from_list([{"text": format_prompt(s)} for s in eval_data])

print(f"[DATASET] Train: {len(train_dataset)} | Eval: {len(eval_dataset)}")

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

# ── LORA CONFIG ───────────────────────────────────────────────────────────────
lora_config = LoraConfig(
    task_type=TaskType.CAUSAL_LM,
    r=16,
    lora_alpha=32,
    lora_dropout=0.05,
    bias="none",
    target_modules=["q_proj", "k_proj", "v_proj", "o_proj"],
)
model = get_peft_model(model, lora_config)

# ── TRAINING ──────────────────────────────────────────────────────────────────
training_args = TrainingArguments(
    output_dir=OUTPUT_DIR,
    num_train_epochs=3,
    per_device_train_batch_size=2,
    gradient_accumulation_steps=4,
    learning_rate=2e-4,
    fp16=True,
    logging_steps=10,
    eval_strategy="epoch",  # Evaluasi tiap epoch
    save_strategy="epoch",
    optim="paged_adamw_32bit",
    report_to="none",
)

trainer = SFTTrainer(
    model=model,
    train_dataset=train_dataset,
    eval_dataset=eval_dataset,
    args=training_args,
    tokenizer=tokenizer,
    dataset_text_field="text",
    max_seq_length=2048,
    packing=False,
)

print(f"[TRAINING] Memulai fine-tuning GRAY-{GRAY_UNIT_ID}...")
trainer.train()

# ── PENTING: SIMPAN HANYA LORA ADAPTER ────────────────────────────────────────
# Jangan merge ke base model! Kita hanya butuh adapternya (~50MB) 
# agar bisa di-hotswap di Ollama dan hemat RAM di Termux.
save_path = f"{OUTPUT_DIR}/gray-{GRAY_UNIT_ID}-adapter"
trainer.save_model(save_path) # Ini hanya menyimpan adapter_model.safetensors
tokenizer.save_pretrained(save_path)
print(f"[SAVED] LoRA Adapter tersimpan di: {save_path}")

# Export ke GGUF (via llama.cpp convert-lora-to-ggml.py)
# Note: Ini harus dijalankan di terminal Kaggle/lokal terpisah.
# python llama.cpp/convert-lora-to-ggml.py ./ant-gray-unit/gray-1-adapter --outfile gray1-adapter.gguf
