#!/bin/bash
cd "$(dirname "$0")"
pm2 start ecosystem.config.js 2>/dev/null || pm2 restart all
pm2 status
