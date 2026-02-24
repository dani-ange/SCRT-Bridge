# SCRT: Semantic Convolutional Reasoning Tree

**A Traceable Agentic Framework for Clinical Sovereignty**
*Built with MedGemma for the Google HAI-DEF Impact Challenge.*

## 🚀 Overview
SCRT is a "Clinical Spine" that channels the reasoning power of MedGemma 
to provide traceable, protocol-driven medical actions in resource-limited settings.

## 🛠️ Key Features
- **Atomic Signal Extraction:** Uses MedGemma-7B to extract clinical tokens.
- **Dynamic Injection:** Update medical protocols without retraining.
- **Black-Box Solution:** Explicit reasoning paths for every action.

## 📦 Installation
1. Clone the repo: `git clone https://github.com/username/SCRT-Project`
2. Install deps: `npm install`
3. Run the app: `npm run dev`

## 🧠 Technical Spec
We use MedGemma as a reasoning agent. The system follows a 
Signal -> Concept -> Syndrome -> Protocol cascade.
## 🛠️ Local Deployment (Ollama)
1. Install [Ollama](https://ollama.com).
2. Run `ollama run MedAIBase/MedGemma1.5:4b`
