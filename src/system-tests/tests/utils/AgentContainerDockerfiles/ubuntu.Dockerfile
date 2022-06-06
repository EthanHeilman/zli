FROM ubuntu:22.10

# Install normal dependencies 
RUN apt update && apt install software-properties-common bash -y
# RUN add-apt-repository ppa:deadsnakes/ppa
RUN apt install python3 -y 

# BastionZero Deps
RUN apt install curl procps -y

# Buffer env var
# Ref: https://stackoverflow.com/questions/59812009/what-is-the-use-of-pythonunbuffered-in-docker-file
ENV PYTHONUNBUFFERED=1

# Params:
ARG REGISTRATION_KEY
# Optional
ARG TARGET_NAME
ARG SERVICE_URL=https://cloud.bastionzero.com/
ARG ENVIRONMENT_NAME

COPY . .
RUN chmod +x ./entrypoint.sh
ENTRYPOINT [ "./entrypoint.sh" ]