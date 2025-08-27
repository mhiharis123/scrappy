#!/usr/bin/env node

/**
 * Setup script to verify and install Python dependencies
 */

import { spawn } from 'child_process'
import { readFile } from 'fs/promises'
import { join } from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Colors for console output
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m'
}

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`)
}

function runCommand(command, args = [], options = {}) {
  return new Promise((resolve, reject) => {
    const process = spawn(command, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      ...options
    })
    
    let stdout = ''
    let stderr = ''
    
    process.stdout.on('data', (data) => {
      stdout += data.toString()
    })
    
    process.stderr.on('data', (data) => {
      stderr += data.toString()
    })
    
    process.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr })
      } else {
        reject(new Error(`Command failed with code ${code}: ${stderr || stdout}`))
      }
    })
    
    process.on('error', (error) => {
      reject(error)
    })
  })
}

async function checkPython() {
  log('🐍 Checking Python installation...', 'blue')
  
  try {
    const { stdout } = await runCommand('python', ['--version'])
    log(`✅ Python found: ${stdout.trim()}`, 'green')
    return 'python'
  } catch (error) {
    try {
      const { stdout } = await runCommand('python3', ['--version'])
      log(`✅ Python3 found: ${stdout.trim()}`, 'green')
      return 'python3'
    } catch (error3) {
      log('❌ Python not found. Please install Python 3.7+ and ensure it\'s in your PATH', 'red')
      process.exit(1)
    }
  }
}

async function installPythonDependencies(pythonCmd) {
  log('📦 Installing Python dependencies...', 'blue')
  
  const requirementsPath = join(__dirname, 'requirements.txt')
  
  try {
    await runCommand(pythonCmd, ['-m', 'pip', 'install', '-r', requirementsPath])
    log('✅ Python dependencies installed successfully', 'green')
  } catch (error) {
    log('❌ Failed to install Python dependencies', 'red')
    log(`Error: ${error.message}`, 'red')
    log('Please try running manually: pip install crawl4ai aiohttp playwright', 'yellow')
    process.exit(1)
  }
}

async function installPlaywright() {
  log('🎭 Installing Playwright browsers...', 'blue')
  
  try {
    await runCommand('playwright', ['install'])
    log('✅ Playwright browsers installed successfully', 'green')
  } catch (error) {
    log('⚠️ Playwright install failed, trying alternative method...', 'yellow')
    try {
      await runCommand('python', ['-m', 'playwright', 'install'])
      log('✅ Playwright browsers installed successfully', 'green')
    } catch (error2) {
      log('❌ Failed to install Playwright browsers', 'red')
      log('Please run manually: playwright install', 'yellow')
    }
  }
}

async function testScraper(pythonCmd) {
  log('🧪 Testing scraper functionality...', 'blue')
  
  const scriptPath = join(__dirname, 'python', 'scraper.py')
  const testUrl = 'https://httpbin.org/html'
  
  try {
    const { stdout } = await runCommand(pythonCmd, [scriptPath, testUrl])
    const result = JSON.parse(stdout)
    
    if (result.success) {
      log('✅ Scraper test successful', 'green')
    } else {
      log(`⚠️ Scraper test failed: ${result.error}`, 'yellow')
    }
  } catch (error) {
    log(`❌ Scraper test failed: ${error.message}`, 'red')
  }
}

async function main() {
  log('🚀 Setting up Crawl4AI Backend...', 'blue')
  log('', 'reset')
  
  try {
    const pythonCmd = await checkPython()
    await installPythonDependencies(pythonCmd)
    await installPlaywright()
    await testScraper(pythonCmd)
    
    log('', 'reset')
    log('🎉 Setup completed successfully!', 'green')
    log('You can now run: npm run dev', 'green')
    
  } catch (error) {
    log('', 'reset')
    log('❌ Setup failed:', 'red')
    log(error.message, 'red')
    process.exit(1)
  }
}

main()