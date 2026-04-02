import os
from dotenv import load_dotenv
from groq import Groq

load_dotenv(override=True)
api_key = os.getenv("GROQ_API_KEY")

if not api_key:
    print("Error: GROQ_API_KEY not found in .env")
    exit(1)

client = Groq(api_key=api_key)

print("Available Groq Models:")
for model in client.models.list().data:
    print("- " + model.id)
