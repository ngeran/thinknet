# File: packages/frontend/xaospy/Dockerfile
FROM python:3.9
WORKDIR /xaospy
# Install build dependencies for PyYAML
RUN apt-get update && apt-get install -y gcc python3-dev libyaml-dev && rm -rf /var/lib/apt/lists/*
COPY . /xaospy
# Explicitly install PyYAML
RUN pip install --no-cache-dir PyYAML
RUN pip install --no-cache-dir -r requirements.txt
RUN chmod -R +x /xaospy/scripts
CMD ["uvicorn", "api:app", "--host", "0.0.0.0", "--port", "8000"]
