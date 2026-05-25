## Overview

Sample configuration for using DeepSeek models in Codex CLI.

## Steps to config:

 - Backup your existing `~/.codex/` folder
 - Copy these files into your `~/.codex/` folder
 - Add your DeepSeek key to `codeproxy.config.json`
 - Launch `sh ~/.codex/run-codeproxy.sh` in a terminal and in another launch `codex`
 - You can use the profiles too by launching `codex -p deepseek-pro` and `codex -p deepseek-flash`
 - Edit the profile/default settings in `config.toml` if you wish to adjust model options.
