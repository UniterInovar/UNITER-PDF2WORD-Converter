# Deploying to Oracle Always Free VM

This guide shows how to deploy the repository's container image to an Oracle Always Free VM running Ubuntu.

Steps overview

1. Create an Oracle Cloud account and provision an Always Free VM (Ubuntu 22.04). Add your public SSH key during creation.
2. Open networking rules (VM ingress) for ports `22`, `80`, and `443`.
3. Create a GitHub Personal Access Token (PAT) with the `read:packages` scope so the VM can pull the image from GitHub Container Registry (GHCR).
4. SSH into the VM and run the provided `deploy.sh` script.

Example (on your machine):

```bash
# replace placeholders
ssh ubuntu@<VM_IP>
# on the VM (run as root or sudo):
sudo CR_PAT=ghp_XXXX GHCR_OWNER=YourGitHubUser GHCR_USERNAME=YourGitHubUser bash -lc "$(curl -sSL https://raw.githubusercontent.com/YourGitHubUser/UNITER-PDF2WORD-Converter/main/deploy/oracle/deploy.sh)"
```

Notes
- The script expects the image `ghcr.io/<GHCR_OWNER>/doc-converter-pro:latest` to exist (the repository's GitHub Actions will publish it when you push `main`).
- You can instead build directly on the VM by cloning the repo and running `docker build -t doc-converter-pro .` but pulling from GHCR is faster.
- For security, store the PAT as an OCI secret or use a short-lived token — avoid embedding it in scripts.

After deploy
- Visit `http://<VM_PUBLIC_IP>/` to use the app.
- To update the app: push to `main` (CI builds the image), then SSH into the VM and re-run the `deploy.sh` command to pull the new image and restart the container.
