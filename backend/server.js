import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import morgan from 'morgan'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { spawn } from 'child_process'
import axios from 'axios'

// Load environment variables
dotenv.config()

// Get current directory
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const app = express()
const PORT = process.env.PORT || 3001

// Request throttling to prevent concurrent scraping issues
let activeScrapeRequests = 0
const MAX_CONCURRENT_REQUESTS = 2

// Circuit breaker pattern for handling repeated failures
let recentFailures = 0
let lastFailureTime = null
const FAILURE_THRESHOLD = 3
const CIRCUIT_BREAKER_TIMEOUT = 30000 // 30 seconds

// Middleware
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }
}))

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}))

app.use(morgan('combined'))
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))

// OpenRouter API configuration
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY
const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1'

/**
 * Validate URL format
 */
function isValidUrl(urlString) {
  try {
    const url = new URL(urlString)
    return ['http:', 'https:'].includes(url.protocol)
  } catch {
    return false
  }
}


/**
 * Enhance scraped content with LLM
 */
async function enhanceWithLLM(scrapedContent, prompt, model) {
  if (!OPENROUTER_API_KEY) {
    throw new Error('OpenRouter API key is not configured')
  }
  
  const systemPrompt = `You are a web scraping assistant. You will be provided with scraped content from a website and asked to process it according to the user's instructions. Always return well-structured, accurate results based on the provided content.`
  
  const userPrompt = `Here is the scraped content:\n\n${scrapedContent.markdown}\n\nTask: ${prompt}\n\nPlease process this content according to the task and return the result in a clear, structured format.`
  
  try {
    const response = await axios.post(
      `${OPENROUTER_BASE_URL}/chat/completions`,
      {
        model: model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        max_tokens: 4000,
        temperature: 0.1
      },
      {
        headers: {
          'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': process.env.FRONTEND_URL || 'http://localhost:3000',
          'X-Title': 'Crawl4AI Web Scraper'
        },
        timeout: 30000
      }
    )
    
    return response.data.choices[0].message.content
  } catch (error) {
    if (error.response) {
      throw new Error(`OpenRouter API error: ${error.response.data.error?.message || error.response.statusText}`)
    } else if (error.request) {
      throw new Error('OpenRouter API request failed - no response received')
    } else {
      throw new Error(`OpenRouter API error: ${error.message}`)
    }
  }
}

/**
 * Health check endpoint
 */
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  })
})

/**
 * Get available models from OpenRouter
 */
app.get('/api/models', async (req, res) => {
  try {
    if (!OPENROUTER_API_KEY) {
      return res.status(500).json({
        success: false,
        error: 'OpenRouter API key is not configured'
      })
    }
    
    const response = await axios.get(`${OPENROUTER_BASE_URL}/models`, {
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json'
      },
      timeout: 10000
    })
    
    // Filter out image/vision models but show all text models
    // Also filter out models with no pricing information as they might not be available
    const models = response.data.data
      .filter(model => 
        !model.id.includes('image') && 
        !model.id.includes('vision') &&
        model.pricing && 
        (model.pricing.prompt || model.pricing.completion)
      )
      .sort((a, b) => {
        // Sort by popularity/quality heuristics
        // 1. Models with both prompt and completion pricing
        const aComplete = a.pricing.prompt && a.pricing.completion ? 1 : 0;
        const bComplete = b.pricing.prompt && b.pricing.completion ? 1 : 0;
        if (aComplete !== bComplete) return bComplete - aComplete;
        
        // 2. Sort by context length (higher is better)
        const aContext = a.context_length || 0;
        const bContext = b.context_length || 0;
        if (aContext !== bContext) return bContext - aContext;
        
        // 3. Sort alphabetically
        return a.id.localeCompare(b.id);
      })
      .map(model => ({
        id: model.id,
        name: model.name || model.id,
        description: model.description || '',
        context_length: model.context_length || 0,
        pricing: model.pricing || {},
        // Add model category for better UX
        category: getModelCategory(model.id)
      }))
    
    res.json(models)
  } catch (error) {
    console.error('Error fetching models:', error.message)
    res.status(500).json({
      success: false,
      error: 'Failed to fetch available models'
    })
  }
})

/**
 * Categorize models for better UX
 */
function getModelCategory(modelId) {
  const modelMap = {
    'mistralai/': 'Mistral AI',
    'openai/': 'OpenAI',
    'anthropic/': 'Anthropic',
    'google/': 'Google',
    'meta-llama/': 'Meta',
    'cohere/': 'Cohere',
    '01-ai/': '01.AI',
    'deepseek/': 'DeepSeek'
  };
  
  for (const [prefix, category] of Object.entries(modelMap)) {
    if (modelId.startsWith(prefix)) {
      return category;
    }
  }
  
  // Default category for other models
  return 'Other Providers';
}

/**
 * Get favorite models (for future server-side storage)
 */
app.get('/api/favorites', async (req, res) => {
  // For now, return empty array since we're using localStorage
  // This can be extended later to support server-side user preferences
  res.json({
    success: true,
    favorites: []
  })
})

/**
 * Add model to favorites (for future server-side storage)
 */
app.post('/api/favorites', async (req, res) => {
  const { modelId } = req.body
  
  if (!modelId) {
    return res.status(400).json({
      success: false,
      error: 'Model ID is required'
    })
  }
  
  // For now, just return success since we're using localStorage
  // This can be extended later to support server-side user preferences
  res.json({
    success: true,
    message: 'Model added to favorites'
  })
})

/**
 * Remove model from favorites (for future server-side storage)
 */
app.delete('/api/favorites/:modelId', async (req, res) => {
  const { modelId } = req.params
  
  if (!modelId) {
    return res.status(400).json({
      success: false,
      error: 'Model ID is required'
    })
  }
  
  // For now, just return success since we're using localStorage
  // This can be extended later to support server-side user preferences
  res.json({
    success: true,
    message: 'Model removed from favorites'
  })
})

/**
 * Main scraping endpoint
 */
app.post('/api/scrape', async (req, res) => {
  // Throttle concurrent requests to prevent resource exhaustion
  if (activeScrapeRequests >= MAX_CONCURRENT_REQUESTS) {
    return res.status(429).json({
      success: false,
      error: 'Too many concurrent scraping requests. Please try again later.'
    })
  }
  
  // Circuit breaker check
  if (recentFailures >= FAILURE_THRESHOLD && lastFailureTime) {
    const timeSinceLastFailure = Date.now() - lastFailureTime
    if (timeSinceLastFailure < CIRCUIT_BREAKER_TIMEOUT) {
      return res.status(503).json({
        success: false,
        error: 'Service temporarily unavailable due to recent failures. Please try again in a few moments.'
      })
    } else {
      // Reset circuit breaker after timeout
      recentFailures = 0
      lastFailureTime = null
    }
  }
  
  activeScrapeRequests++
  console.log(`Active scraping requests: ${activeScrapeRequests}`)
  
  try {
    const { url, useLlm = false, prompt, model, usePagination = false, maxPages = 5 } = req.body
    
    // Validate required fields
    if (!url || typeof url !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'URL is required and must be a string'
      })
    }
    
    if (!isValidUrl(url)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid URL format'
      })
    }
    
    if (useLlm && !prompt) {
      return res.status(400).json({
        success: false,
        error: 'Prompt is required when LLM enhancement is enabled'
      })
    }
    
    // Validate pagination parameters
    if (usePagination) {
      if (typeof maxPages !== 'number' || maxPages < 1 || maxPages > 50) {
        return res.status(400).json({
          success: false,
          error: 'maxPages must be a number between 1 and 50'
        })
      }
    }
    
    // Set default model if LLM is enabled but no model is specified\n    // Use a more robust default model selection\n    let effectiveModel = model;\n    if (useLlm && !effectiveModel) {\n      // Try to get a list of recommended models\n      try {\n        const modelsResponse = await axios.get(`${OPENROUTER_BASE_URL}/models`, {\n          headers: {\n            'Authorization': `Bearer ${OPENROUTER_API_KEY}`,\n            'Content-Type': 'application/json'\n          },\n          timeout: 5000\n        });\n        \n        // Find a well-priced, high-context model\n        const recommendedModels = modelsResponse.data.data\n          .filter(m => \n            !m.id.includes('image') && \n            !m.id.includes('vision') &&\n            m.pricing && \n            m.pricing.prompt && \n            m.pricing.completion &&\n            (m.context_length || 0) >= 4096\n          )\n          .sort((a, b) => {\n            // Prefer less expensive models\n            const aPrice = parseFloat(a.pricing.prompt) + parseFloat(a.pricing.completion);\n            const bPrice = parseFloat(b.pricing.prompt) + parseFloat(b.pricing.completion);\n            return aPrice - bPrice;\n          });\n          \n        if (recommendedModels.length > 0) {\n          effectiveModel = recommendedModels[0].id;\n        } else {\n          // Fallback to a known good model\n          effectiveModel = 'mistralai/mixtral-8x7b-instruct';\n        }\n      } catch (modelError) {\n        // Fallback to a known good model if we can't fetch models\n        effectiveModel = 'mistralai/mixtral-8x7b-instruct';\n        console.warn('Could not fetch models for default selection, using fallback:', effectiveModel);\n      }\n    }\n    \n    // Ensure we have a model if LLM is enabled\n    if (useLlm && !effectiveModel) {\n      effectiveModel = 'mistralai/mixtral-8x7b-instruct';\n    }
    
    // Step 1: Scrape the website
    console.log(`Scraping URL: ${url}${usePagination ? ` with pagination (max ${maxPages} pages)` : ''}`)
    const scrapingResult = await runPythonScraper(url, null, usePagination, maxPages)
    
    if (!scrapingResult.success) {
      return res.status(500).json(scrapingResult)
    }
    
    let finalResult = scrapingResult
    
    // Step 2: Enhance with LLM if requested
    if (useLlm) {
      try {
        console.log(`Enhancing with LLM using model: ${effectiveModel}`)
        const enhancedContent = await enhanceWithLLM(scrapingResult.data, prompt, effectiveModel)
        
        // Try to parse as JSON, fallback to treating as markdown
        let enhancedJson = {}
        try {
          enhancedJson = JSON.parse(enhancedContent)
        } catch {
          enhancedJson = { enhanced_content: enhancedContent }
        }
        
        finalResult = {
          success: true,
          data: {
            ...scrapingResult.data,
            markdown: enhancedContent,
            json: {
              ...scrapingResult.data.json,
              llm_enhanced: enhancedJson
            },
            llm_enhanced: true,
            model_used: effectiveModel,
            prompt_used: prompt
          }
        }
      } catch (llmError) {
        console.error('LLM enhancement failed:', llmError.message)
        // Return original result with error note
        finalResult = {
          success: true,
          data: {
            ...scrapingResult.data,
            json: {
              ...scrapingResult.data.json,
              llm_enhancement_error: llmError.message
            }
          }
        }
      }
    }
    
    // Reset failure count on successful scraping
    if (finalResult.success) {
      recentFailures = 0
      lastFailureTime = null
    }
    
    res.json(finalResult)
    
  } catch (error) {
    console.error('Scraping error:', error.message)
    
    // Increment failure count for circuit breaker
    recentFailures++
    lastFailureTime = Date.now()
    
    res.status(500).json({
      success: false,
      error: 'Internal server error during scraping'
    })
  } finally {
    // Always decrement the counter regardless of success or failure
    activeScrapeRequests--
    console.log(`Active scraping requests after completion: ${activeScrapeRequests}`)
  }
})

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Unhandled error:', error)
  res.status(500).json({
    success: false,
    error: 'Internal server error'
  })
})

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found'
  })
})

// Track running processes for cleanup
const runningProcesses = new Set()

// Enhanced process creation with tracking
function createTrackedPythonProcess(pythonPath, args, options) {
  const process = spawn(pythonPath, args, options)
  runningProcesses.add(process)
  
  process.on('close', () => {
    runningProcesses.delete(process)
  })
  
  return process
}

// Update the runPythonScraper function to use tracked processes
function runPythonScraper(url, extractionStrategy = null, usePagination = false, maxPages = 5) {
  return new Promise((resolve, reject) => {
    const pythonPath = process.env.PYTHON_PATH || 'python'
    const scriptPath = join(__dirname, 'python', usePagination ? 'pagination_scraper.py' : 'scraper.py')
    
    const args = [scriptPath, url]
    
    if (usePagination) {
      args.push('--pagination')
      args.push(`--max-pages=${maxPages}`)
    }
    
    if (extractionStrategy) {
      args.push(JSON.stringify(extractionStrategy))
    }
    
    // Use tracked process creation
    const pythonProcess = createTrackedPythonProcess(pythonPath, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      encoding: 'utf8',
      env: {
        ...process.env,
        PYTHONIOENCODING: 'utf-8'
      }
    })
    
    let stdout = ''
    let stderr = ''
    
    pythonProcess.stdout.on('data', (data) => {
      stdout += data.toString('utf-8')
    })
    
    pythonProcess.stderr.on('data', (data) => {
      stderr += data.toString('utf-8')
    })
    
    let forceKillTimeout = null
    let isProcessKilled = false
    
    // Set timeout for long-running requests
    const timeout = setTimeout(() => {
      if (!isProcessKilled) {
        isProcessKilled = true
        console.log(`Terminating Python process due to timeout for URL: ${url}`)
        pythonProcess.kill('SIGTERM')
        
        // Force kill after 10 seconds if SIGTERM doesn't work
        forceKillTimeout = setTimeout(() => {
          if (pythonProcess.pid) {
            console.log(`Force killing Python process ${pythonProcess.pid}`)
            try {
              pythonProcess.kill('SIGKILL')
            } catch (killError) {
              console.error('Error force killing process:', killError.message)
            }
          }
        }, 10000) // Increased to 10 seconds for proper cleanup
        
        reject(new Error('Scraping timeout - request took too long'))
      }
    }, 50000) // Reduced to 50 seconds to allow for cleanup
    
    pythonProcess.on('close', (code) => {
      clearTimeout(timeout) // Clear the timeout when process completes
      if (forceKillTimeout) clearTimeout(forceKillTimeout)
      if (code === 0) {
        try {
          // Clean stdout by removing debug messages and finding the JSON part
          let cleanOutput = stdout.trim()
          
          // Find the first occurrence of '{' which should be the start of JSON
          const jsonStart = cleanOutput.indexOf('{')
          if (jsonStart > 0) {
            cleanOutput = cleanOutput.substring(jsonStart)
          }
          
          // Find the last occurrence of '}' which should be the end of JSON
          const jsonEnd = cleanOutput.lastIndexOf('}')
          if (jsonEnd > 0 && jsonEnd < cleanOutput.length - 1) {
            cleanOutput = cleanOutput.substring(0, jsonEnd + 1)
          }
          
          const result = JSON.parse(cleanOutput)
          resolve(result)
        } catch (error) {
          reject(new Error(`Failed to parse Python script output: ${error.message}. Output: ${stdout}`))
        }
      } else {
        reject(new Error(`Python script failed with code ${code}: ${stderr || 'No error message'}`))
      }
    })
    
    pythonProcess.on('error', (error) => {
      clearTimeout(timeout) // Clear the timeout on error
      if (forceKillTimeout) clearTimeout(forceKillTimeout)
      reject(new Error(`Failed to start Python script: ${error.message}`))
    })
  })
}

// Graceful shutdown handling
function gracefulShutdown() {
  console.log('Received shutdown signal. Cleaning up running processes...')
  
  runningProcesses.forEach(process => {
    try {
      console.log(`Terminating process ${process.pid}`)
      process.kill('SIGTERM')
      
      setTimeout(() => {
        try {
          process.kill('SIGKILL')
        } catch (error) {
          // Process already dead
        }
      }, 5000)
    } catch (error) {
      // Process already dead
    }
  })
  
  setTimeout(() => {
    process.exit(0)
  }, 10000)
}

process.on('SIGINT', gracefulShutdown)
process.on('SIGTERM', gracefulShutdown)

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`)
  console.log(`📝 API endpoints:`)
  console.log(`   GET  /api/health`)
  console.log(`   GET  /api/models`)
  console.log(`   POST /api/scrape`)
  
  if (!OPENROUTER_API_KEY) {
    console.log(`⚠️  Warning: OPENROUTER_API_KEY not set - LLM features will not work`)
  }
})