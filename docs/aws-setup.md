# Setting up Haven on AWS

A step-by-step walkthrough, from an empty AWS account to a live site that redeploys every time you push to `main`. Allow about 60-90 minutes the first time.

## How the pieces fit

```
you push to main
      │
      ▼
GitHub Actions ── runs tests ──► builds Docker images ──► Amazon ECR (stores the images)
      │
      └─ SSH ─► your EC2 server ── pulls the images from ECR ──► docker compose up
                      │
                      └─► http://<your-server-ip>  (nginx → Flask → Postgres)
```

| Piece | What it's for |
| --- | --- |
| **ECR** | A private store for your Docker images (`haven-api`, `haven-web`). |
| **EC2** | One small server that runs the whole stack with Docker Compose. |
| **IAM role + OIDC** | Lets GitHub Actions push to ECR using short-lived credentials, so no AWS keys are stored in GitHub. |
| **GitHub secrets** | Where the workflow finds the server address, SSH key, and role. |

The deploy job in `.github/workflows/ci.yml` is **skipped until you create the `AWS_REGION` variable** (step 7), so you can do all of this without affecting anything until the last step.

## What you'll need

- An AWS account, and a way to sign in that is **not the root user**. If you only have the root login, create an IAM user or an IAM Identity Center user with administrator access and use that day to day.
- Admin access to the GitHub repository (`migsszz/Haven`), to add secrets.
- A terminal. On Windows, **PowerShell** works for the local steps; the server steps run in a browser terminal, so you don't need to fight SSH key permissions.
- About $15-25 a month for the server while it runs (a `t3.small` plus its public IP address; prices vary by region, so check the [AWS pricing calculator](https://calculator.aws/)).

---

## Step 0: Protect your wallet

Do this first.

1. Open **Billing and Cost Management → Budgets → Create budget**.
2. Choose **Zero spend budget** or a **monthly cost budget** of about $30, and add your email for alerts.

Also pick your **region** now (the dropdown at the top right of the console) and stay in it for every step. A region close to your users is best, for example **Asia Pacific (Singapore) `ap-southeast-1`**. Write it down: it becomes your `AWS_REGION`.

---

## Step 1: Create the two ECR repositories

ECR is where CI puts the built images. The names matter: the workflow pushes to `<registry>/haven-api` and `<registry>/haven-web`.

**Console:** search for **ECR → Create repository** → visibility **Private** → name `haven-api` → **Create**. Repeat for `haven-web`.

**Or with the AWS CLI:**
```bash
aws ecr create-repository --repository-name haven-api --region ap-southeast-1
aws ecr create-repository --repository-name haven-web --region ap-southeast-1
```

✅ **Checkpoint:** ECR lists both repositories. Copy the URI of one. It looks like `123456789012.dkr.ecr.ap-southeast-1.amazonaws.com/haven-api`. The 12 digits are your **account ID**; you'll need it in steps 4 and 6.

---

## Step 2: Create the role the server uses to pull images

The server must be allowed to download images from ECR. You give it a role instead of copying keys onto it.

1. **IAM → Roles → Create role**.
2. Trusted entity: **AWS service**, use case **EC2**. Click **Next**.
3. Search for and tick **`AmazonEC2ContainerRegistryReadOnly`**. Click **Next**.
4. Name it `haven-ec2-role` and click **Create role**.

---

## Step 3: Launch the EC2 server

**EC2 → Instances → Launch instances**, then:

| Setting | Value |
| --- | --- |
| Name | `haven` |
| AMI | **Amazon Linux 2023** (64-bit x86) |
| Instance type | **`t3.small`** (2 GB RAM; `t3.micro` is too tight for Postgres plus Flask plus nginx) |
| Key pair | **Create new key pair** → name `haven-admin`, type ED25519, `.pem`. It downloads once; keep it safe. |
| Network settings → Edit | Create a new security group with these inbound rules: **SSH (22)** from *Anywhere*, **HTTP (80)** from *Anywhere*. |
| Storage | **20 GiB** gp3 |
| Advanced details → IAM instance profile | `haven-ec2-role` |

Click **Launch instance**.

> **About SSH from "Anywhere":** GitHub Actions runs from changing IP addresses, so the deploy step needs port 22 reachable. This is acceptable because Amazon Linux only allows key-based SSH logins (no passwords). If you want to tighten it later, switch the deploy to AWS Systems Manager instead of SSH.

### Give it a fixed address

Without this, the server's IP changes whenever it restarts and your `EC2_HOST` secret breaks.

1. **EC2 → Elastic IPs → Allocate Elastic IP address → Allocate**.
2. Select it → **Actions → Associate Elastic IP address** → pick the `haven` instance → **Associate**.

✅ **Checkpoint:** copy the Elastic IP. This is your `EC2_HOST`.

---

## Step 4: Prepare the server

Open a terminal on the server without any key setup: **EC2 → Instances → select `haven` → Connect → EC2 Instance Connect → Connect**. A browser terminal opens as `ec2-user`.

### 4a. Install Docker and Compose

```bash
sudo dnf install -y docker
sudo systemctl enable --now docker
sudo usermod -aG docker ec2-user

sudo mkdir -p /usr/local/lib/docker/cli-plugins
sudo curl -SL "https://github.com/docker/compose/releases/latest/download/docker-compose-linux-$(uname -m)" -o /usr/local/lib/docker/cli-plugins/docker-compose
sudo chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
```

> **Paste tip:** the browser terminal can join pasted lines together, which breaks commands that continue onto a second line with `\`. That is why the `curl` command above is one long line. If a command misbehaves after pasting, run it one line at a time. A `curl` that prints "Binary output can mess up your terminal" means its `-o` option got lost this way.

Close the browser terminal and open a new one (so the `docker` group applies), then check:

```bash
docker compose version      # prints a version
aws --version               # the AWS CLI is preinstalled; the deploy script needs it
aws sts get-caller-identity # the Arn line should contain assumed-role/haven-ec2-role/i-...
```

`get-caller-identity` always prints three fields (`UserId`, `Account`, `Arn`). The role name is inside the `Arn` value. If you instead see "Unable to locate credentials", the role isn't attached: in EC2 choose **Actions → Security → Modify IAM role** and pick `haven-ec2-role`.

### 4b. Create the app's settings file

Replace `ACCOUNT_ID` and `REGION` with yours.

```bash
mkdir -p ~/haven
cat > ~/haven/.env <<EOF
JWT_SECRET=$(python3 -c "import secrets; print(secrets.token_urlsafe(48))")
POSTGRES_PASSWORD=$(python3 -c "import secrets; print(secrets.token_hex(16))")
HTTP_PORT=80
IMAGE_PREFIX=ACCOUNT_ID.dkr.ecr.REGION.amazonaws.com/haven
IMAGE_TAG=latest
EOF
chmod 600 ~/haven/.env
```

Notes:
- `POSTGRES_PASSWORD` is letters and digits on purpose: it's placed inside a database URL, so characters like `@` or `/` would break it.
- The password is only applied the **first** time the database starts. Set it before the first deploy; changing it later does not change the existing database.
- `IMAGE_PREFIX` and `IMAGE_TAG` let you run `docker compose` by hand on the server later. During a deploy, CI overrides `IMAGE_TAG` with the exact commit.

**Optional: turn on the shopping assistant.** Add your OpenAI key (never commit it):
```bash
echo 'OPENAI_API_KEY=sk-...' >> ~/haven/.env
```
Without a key the site works normally and the chat button simply doesn't appear.

### 4c. Create a key for GitHub to log in with

On **your own computer** (PowerShell, macOS, or Linux):
```bash
ssh-keygen -t ed25519 -f haven-deploy
```
Press Enter twice when asked for a passphrase (GitHub can't type one). This makes two files: `haven-deploy` (private, goes to GitHub) and `haven-deploy.pub` (public, goes on the server).

Show the public key and copy the whole line:
```bash
cat haven-deploy.pub        # PowerShell: type haven-deploy.pub
```

Back in the server's browser terminal, add it (paste your line between the quotes):
```bash
echo 'ssh-ed25519 AAAA... you@computer' >> ~/.ssh/authorized_keys
```

✅ **Checkpoint:** on your computer, `ssh -i haven-deploy ec2-user@<elastic-ip> "echo ok"` prints `ok`. (Type `yes` to the host prompt the first time.)

---

## Step 5: Let GitHub talk to AWS (OIDC)

This is what removes the need for stored AWS keys.

### 5a. Add GitHub as an identity provider

**IAM → Identity providers → Add provider**
- Provider type: **OpenID Connect**
- Provider URL: `https://token.actions.githubusercontent.com`
- Audience: `sts.amazonaws.com`
- **Add provider**

### 5b. Create the permissions policy

**IAM → Policies → Create policy → JSON.** Paste this, replacing `REGION` and `ACCOUNT_ID`:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    { "Effect": "Allow", "Action": "ecr:GetAuthorizationToken", "Resource": "*" },
    {
      "Effect": "Allow",
      "Action": [
        "ecr:BatchCheckLayerAvailability",
        "ecr:InitiateLayerUpload",
        "ecr:UploadLayerPart",
        "ecr:CompleteLayerUpload",
        "ecr:PutImage"
      ],
      "Resource": [
        "arn:aws:ecr:REGION:ACCOUNT_ID:repository/haven-api",
        "arn:aws:ecr:REGION:ACCOUNT_ID:repository/haven-web"
      ]
    }
  ]
}
```
Name it `haven-ci-push` and create it.

### 5c. Create the role GitHub assumes

**IAM → Roles → Create role**
- Trusted entity: **Web identity**
- Identity provider: `token.actions.githubusercontent.com`; Audience: `sts.amazonaws.com`
- GitHub organization: `migsszz`; repository: `Haven`; branch: `main`
- Attach the `haven-ci-push` policy.
- Name it `haven-github-deploy` and create it.

Open the role and copy its **ARN**. This is your `AWS_DEPLOY_ROLE_ARN`.

✅ **Checkpoint:** the role's *Trust relationships* tab shows a condition like `token.actions.githubusercontent.com:sub` matching `repo:migsszz/Haven:ref:refs/heads/main`. That condition is what stops any other repository or branch from using the role.

---

## Step 6: Add the GitHub secrets

In GitHub: **Haven repo → Settings → Secrets and variables → Actions → New repository secret.**

| Secret | Value |
| --- | --- |
| `AWS_DEPLOY_ROLE_ARN` | the role ARN from step 5c |
| `EC2_HOST` | the Elastic IP |
| `EC2_USER` | `ec2-user` |
| `EC2_SSH_KEY` | the **entire contents** of the private `haven-deploy` file, including the `-----BEGIN` and `-----END` lines |

---

## Step 7: Turn the deploy on

On the same page, open the **Variables** tab → **New repository variable**:

| Variable | Value |
| --- | --- |
| `AWS_REGION` | your region, for example `ap-southeast-1` |

It's a **variable**, not a secret. This is the switch that enables the deploy job.

Now push any commit to `main`, or open **Actions → CI → Re-run all jobs**. The pipeline runs the tests, builds and pushes both images to ECR, copies `docker-compose.yml` and the database scripts to the server, and starts the stack.

✅ **Checkpoint:** the **Build images and deploy to AWS** job turns green, and `http://<elastic-ip>` shows Haven.

---

## Step 8: Create your admin account

On the server (browser terminal), after the first successful deploy:

```bash
cd ~/haven
docker compose exec api flask --app wsgi create-admin you@example.com 'a-strong-password'
```

Sign in on the site with those details. You'll see an **Admin** link for managing products (with photo upload) and orders.

---

## Troubleshooting

| What you see | Likely cause and fix |
| --- | --- |
| The deploy job doesn't appear or is skipped | The `AWS_REGION` **variable** is missing or is stored as a secret. It must be a variable. It only runs on pushes to `main`. |
| `Not authorized to perform sts:AssumeRoleWithWebIdentity` | The role's trust condition doesn't match. Check the repo is exactly `migsszz/Haven` and the branch is `main`, and that the provider's audience is `sts.amazonaws.com`. |
| `AccessDenied` or `not authorized to perform: ecr:...` on push | The policy is missing an action, or the ARNs use the wrong region or account ID. |
| `repository ... does not exist` | The ECR repository names or region don't match (`haven-api`, `haven-web`). |
| SSH step times out | The security group doesn't allow port 22, or `EC2_HOST` is wrong. |
| `ssh: handshake failed` or `Permission denied (publickey)` | `EC2_SSH_KEY` is incomplete (needs the BEGIN and END lines), or the public key isn't in `~/.ssh/authorized_keys`. |
| `no basic auth credentials` or pull denied on the server | The instance doesn't have `haven-ec2-role` attached. In EC2, use **Actions → Security → Modify IAM role**. |
| `required variable JWT_SECRET is missing` | `~/haven/.env` doesn't exist or is in the wrong folder. It must be `~/haven/.env`. |
| Site shows 502 | The API container is down. Run `docker compose logs api` in `~/haven`. |
| Site loads but the chat button is missing | No `OPENAI_API_KEY` in `.env`. Add it, then `docker compose up -d`. |

---

## Day-to-day

**See what's running and read logs** (on the server, in `~/haven`):
```bash
docker compose ps
docker compose logs -f api
```

**Redeploy:** push to `main`. To restart by hand, run `docker compose pull api web && docker compose up -d --no-build`.

**Roll back:** every image is tagged with its commit. Either re-run the deploy job on an older commit in the Actions tab, or on the server run `IMAGE_TAG=<older commit sha> docker compose up -d --no-build`.

**Back up your data.** Two Docker volumes hold everything that isn't code:
```bash
# the database
docker compose exec -T db pg_dump -U haven haven > ~/haven-$(date +%F).sql
# the uploaded product photos
docker run --rm -v haven_uploads:/data -v ~:/backup alpine tar czf /backup/uploads-$(date +%F).tgz -C /data .
```
Copy those files off the server (for example to S3) regularly. If the instance is lost without a backup, the data is lost too.

**Stop paying for it.** Stop the instance when you don't need it (the data stays on its disk, but you still pay for the disk and the Elastic IP). To remove everything: terminate the instance, release the Elastic IP, delete the ECR repositories, and delete the IAM role, policy, and provider.

---

## What this setup does not cover yet

- **HTTPS.** Right now the site is `http://`, so logins and tokens cross the internet unencrypted. Before real customers use it, point a domain at the Elastic IP and put Caddy (automatic certificates) or an Application Load Balancer with an AWS certificate in front of it.
- **A managed database and file storage.** Postgres and photos live on the one server's disk. RDS and S3 are the upgrade path.
- **High availability.** One server means a restart or failure takes the site down briefly. ECS Fargate behind a load balancer is the usual next step.
