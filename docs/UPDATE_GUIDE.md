# 应用自动更新功能

## 功能说明

EK-OmniProbe 现已支持自动更新功能,可以从 GitHub Releases 自动检测和安装新版本。

## 使用方法

### 1. 检查更新

- 应用启动时会自动检查更新
- 也可以点击顶部栏右侧的"检查更新"按钮手动检查

### 2. 安装更新

当发现新版本时:
1. 会弹出更新对话框,显示版本信息和更新内容
2. 点击"立即更新"按钮开始下载
3. 下载完成后应用会自动重启并安装更新

## 发布新版本

### 1. 更新版本号

在以下文件中同步更新版本号:
- `package.json`
- `src-tauri/Cargo.toml`
- `src-tauri/tauri.conf.json`
- `README.md`
- `CHANGELOG.md`

### 2. 构建发布包

```bash
# 构建应用
npm run tauri build
```

### 3. 生成签名(可选)

如果需要签名验证,使用 Tauri CLI 生成签名:

```bash
# 生成密钥对(首次)
tauri signer generate -w ~/.tauri/myapp.key

# 为发布包生成签名
tauri signer sign path/to/bundle.zip
```

将公钥添加到 `tauri.conf.json` 的 `plugins.updater.pubkey` 字段。

### 4. 创建 latest.json

基于 `.github/latest.json.template` 创建 `latest.json` 文件:

```json
{
  "version": "v0.5.0",
  "notes": "更新内容说明",
  "pub_date": "2026-01-24T12:00:00Z",
  "platforms": {
    "windows-x86_64": {
      "signature": "生成的签名(可选)",
      "url": "https://github.com/zuoliangyu/ZUOLANDAPLINK/releases/download/v0.5.0/ZUOLAN.DAPLINK_0.5.0_x64_en-US.msi.zip"
    }
  }
}
```

### 5. 发布到 GitHub

1. 创建新的 Release
2. 上传构建的安装包
3. 上传 `latest.json` 文件
4. 发布 Release

## 更新流程

```
应用启动 → 检查更新 → 发现新版本 → 显示对话框
                                    ↓
用户确认 → 下载更新 → 安装更新 → 重启应用
```

## 配置说明

更新配置位于 `src-tauri/tauri.conf.json`:

```json
{
  "plugins": {
    "updater": {
      "active": true,
      "endpoints": [
        "https://github.com/zuoliangyu/ZUOLANDAPLINK/releases/latest/download/latest.json"
      ],
      "dialog": false,
      "pubkey": ""
    }
  }
}
```

- `active`: 是否启用更新功能
- `endpoints`: 更新检查的 URL 列表
- `dialog`: 是否使用系统对话框(false 表示使用自定义 UI)
- `pubkey`: 用于验证签名的公钥(可选)

## 注意事项

1. **版本号格式**: 必须使用语义化版本号,如 `v0.5.0`
2. **文件格式**: 安装包必须是压缩格式(.zip, .tar.gz)
3. **URL 路径**: 确保 latest.json 中的下载 URL 正确
4. **签名验证**: 如果配置了 pubkey,必须提供有效的签名
5. **网络连接**: 更新功能需要网络连接到 GitHub

## 故障排除

### 检查更新失败

- 检查网络连接
- 确认 GitHub Releases 中存在 latest.json
- 查看应用日志获取详细错误信息

### 下载失败

- 检查 latest.json 中的 URL 是否正确
- 确认文件已上传到 GitHub Releases
- 检查文件大小和格式

### 安装失败

- 确认下载的文件完整
- 检查签名是否匹配(如果启用)
- 查看系统权限设置
