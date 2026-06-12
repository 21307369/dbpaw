# DbPaw 自动更新配置指南

为了启用自动更新功能，您需要执行以下一次性配置步骤。

## 1. 生成签名密钥 (必需)

Tauri v2 强制要求对更新包进行签名。您需要生成一对密钥（私钥用于签名，公钥用于验证）。

在项目根目录下运行以下命令：

```bash
bun tauri signer generate -w ~/.tauri/dbpaw.key
```

这将在您的主目录下创建密钥文件，并输出类似以下内容：

```
Keypair generated successfully!
Private key: ...
Public key: ...
```

## 2. 配置公钥 (Public Key)

打开 `src-tauri/tauri.conf.json` 文件，找到 `plugins.updater.pubkey` 字段，将生成的 **Public key** 填入其中。

```json
"plugins": {
  "updater": {
    "endpoints": [
      "https://github.com/USERNAME/REPO/releases/latest/download/latest.json"
    ],
    "pubkey": "在此处填入您的公钥"
  }
}
```

同时，请修改 `endpoints` 中的 URL，将 `USERNAME` 和 `REPO` 替换为您的 GitHub 用户名和仓库名。

## 3. 配置私钥 (Private Key)

为了让 GitHub Actions 自动构建并签名更新包，您需要将私钥配置为 GitHub Secrets。

1. 进入您的 GitHub 仓库页面。
2. 点击 **Settings** -> **Secrets and variables** -> **Actions**。
3. 点击 **New repository secret**。
4. 添加以下两个 Secret：
    - `TAURI_SIGNING_PRIVATE_KEY`: 填入生成的 **Private key** 内容。
    - `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`: 如果生成密钥时设置了密码，填入密码；如果没有设置密码，此项可不填或留空（视 Action 配置而定，通常建议留空即可）。

## 4. 验证更新

发布新版本时（通过 GitHub Release），Tauri Action 会自动使用私钥签名并上传构建产物。应用端的自动更新检测逻辑将：
1. 检查 GitHub Releases 中的 `latest.json`。
2. 验证签名。
3. 提示用户更新。
