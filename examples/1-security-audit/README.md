# Example 1: Security Audit

## Prerequisites
- `npm install`
- `ollama pull qwen2.5:0.5b` (For the Gray Unit SLM)

## Step 1: Review vulnerable code
Run the ANT Swarm architecture to scan the dummy target application:
```bash
ant /swarm examples/1-security-audit/target-app.js
```

## Step 2: Check results
Review the compiled mission results in the workspace blackboard:
```bash
cat workspace/missions/*.json
```

## Expected Output
- **GRAY-1:** Buffer overflow / Race condition logic detected in `handleBuffer`
- **GRAY-2:** XSS and SQL injection vulnerabilities found in `/user`
- **GRAY-5:** Exposed dummy AWS key detected
