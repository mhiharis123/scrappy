# Crawl4AI Web Scraping Application

A modern web scraping application that combines the power of Crawl4AI with optional LLM enhancement for intelligent data extraction and processing.

## Features

- **Dual Scraping Modes**: Standard Crawl4AI scraping and LLM-enhanced processing
- **Modern UI**: React frontend with Tailwind CSS and shadcn/ui components
- **Firecrawl-style Design**: Clean, responsive interface with dark/light mode support
- **LLM Integration**: OpenRouter API integration with multiple AI models
- **Unified Output**: Combined Markdown and JSON results in a single container
- **Real-time Processing**: Live updates and error handling
- **Secure**: Environment-based API key management

## Architecture

- **Frontend**: React 18 + TypeScript + Tailwind CSS + shadcn/ui
- **Backend**: Node.js + Express + Python integration
- **Scraping Engine**: Crawl4AI (Python)
- **LLM Provider**: OpenRouter API
- **Styling**: Tailwind CSS with custom design system

## Prerequisites

- Node.js 16+ and npm
- Python 3.7+
- OpenRouter API key (for LLM features)

## Quick Start

1. **Clone and Install Dependencies**
   ```bash
   cd Crawl4ai
   npm run install:all
   ```

2. **Set Up Backend**
   ```bash
   cd backend
   npm run setup
   ```

3. **Configure Environment**
   ```bash
   # Copy environment template
   cp .env.example .env
   
   # Add your OpenRouter API key to .env
   OPENROUTER_API_KEY=your_api_key_here
   ```

4. **Start Development Servers**
   ```bash
   # From project root
   npm run dev
   ```

   This will start:
   - Backend server on http://localhost:3001
   - Frontend development server on http://localhost:3000

## Manual Setup

### Backend Setup

```bash
cd backend

# Install Node dependencies
npm install

# Set up Python environment and dependencies
npm run setup

# Create environment file
cp .env.example .env
# Edit .env with your OpenRouter API key

# Start backend
npm run dev
```

### Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Start development server
npm run dev
```

## Usage

### Basic Web Scraping

1. Enter a URL in the input field
2. Click "Scrape Website"
3. View results in Markdown and JSON tabs

### Handling Verification-Challenged Sites

Some websites implement bot detection mechanisms that may interfere with scraping. Crawl4AI uses Playwright under the hood to handle many of these challenges automatically. For sites that require additional handling:

1. Increase the delay before returning HTML in the scraper configuration
2. Use longer timeouts for pages that load slowly
3. The system automatically attempts fallback methods for challenging sites

### LLM-Enhanced Scraping

1. Toggle on "AI Enhancement"
2. Select an AI model from the dropdown
3. Enter a prompt describing how you want the content processed
4. Click "Scrape Website"
5. View AI-processed results

### Example Prompts

- "Extract all product names, prices, and descriptions in JSON format"
- "Summarize the main points of this article in bullet points"
- "Create a structured table of all the links and their descriptions"
- "Extract contact information and format it as a business card"

## API Endpoints

### GET /api/health
Health check endpoint

### GET /api/models
Returns available OpenRouter models

### POST /api/scrape
Main scraping endpoint

**Request Body:**
```json
{
  "url": "https://example.com",
  "useLlm": false,
  "prompt": "Optional: describe processing instructions",
  "model": "Optional: OpenRouter model ID"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "markdown": "Scraped content in markdown",
    "json": { "structured": "data" },
    "url": "https://example.com",
    "title": "Page title"
  }
}
```

## Configuration

### Environment Variables

**Backend (.env):**
- `OPENROUTER_API_KEY`: Your OpenRouter API key
- `PORT`: Backend server port (default: 3001)
- `NODE_ENV`: Environment mode
- `FRONTEND_URL`: Frontend URL for CORS

### Python Dependencies

The setup script automatically installs:
- crawl4ai: Web scraping engine (v0.7.4 or higher recommended for better verification handling)
- aiohttp: Async HTTP client
- playwright: Browser automation

To update your dependencies:
```bash
cd backend
pip install -r requirements.txt --upgrade
```

## Development

### Project Structure

```
Crawl4ai/
├── frontend/           # React frontend
│   ├── src/
│   │   ├── components/ # React components
│   │   ├── hooks/      # Custom hooks
│   │   ├── lib/        # Utilities
│   │   └── ui/         # shadcn/ui components
├── backend/            # Node.js backend
│   ├── python/         # Python scraping scripts
│   ├── server.js       # Main server file
│   └── setup.js        # Setup automation
└── README.md
```

### Available Scripts

**Root:**
- `npm run dev`: Start both frontend and backend
- `npm run install:all`: Install all dependencies

**Frontend:**
- `npm run dev`: Start development server
- `npm run build`: Build for production

**Backend:**
- `npm run setup`: Set up Python dependencies
- `npm run dev`: Start development server
- `npm start`: Start production server

## Troubleshooting

### Python Issues
```bash
# Check Python installation
python --version
# or
python3 --version

# Install dependencies manually
pip install crawl4ai aiohttp playwright
playwright install
```

### Module Import Issues
```bash
# Frontend path resolution
# Check tsconfig.json baseUrl and paths configuration

# Backend ES modules
# Ensure package.json has "type": "module"
```

### API Connection Issues
- Verify backend is running on port 3001
- Check CORS configuration in server.js
- Ensure proxy is set in frontend package.json

## Security Notes

- API keys are stored server-side only
- Input validation on all endpoints
- CORS configured for specified origins
- Request timeouts to prevent hanging

## License

MIT License

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## Support

For issues and questions:
1. Check the troubleshooting section
2. Review API documentation
3. Check Python and Node.js versions
4. Verify environment configuration