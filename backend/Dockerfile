# 1. Use a lightweight Python base image
FROM python:3.11-slim

# 2. Set environment variables to ensure Python output goes straight to the terminal
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# 3. Install the OS-level dependencies: Tesseract OCR and Language Packs
# We also include libgl1 and libglib2.0-0 which are often required by image processing libraries
RUN apt-get update && apt-get install -y \
    tesseract-ocr \
    tesseract-ocr-eng \
    tesseract-ocr-hin \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# 4. Set the working directory inside the container
WORKDIR /app

# 5. Copy the requirements file into the container
COPY requirements.txt .

# 6. Install the Python dependencies (using the optimized file we made earlier)
RUN pip install --no-cache-dir -r requirements.txt

# 7. Copy the rest of your backend code into the container
COPY . .

# 8. Start the FastAPI server using Render's dynamic $PORT variable
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"]