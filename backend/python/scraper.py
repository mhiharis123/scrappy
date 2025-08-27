#!/usr/bin/env python3
"""
Python scraper script using Crawl4AI
This script handles the actual web scraping using Crawl4AI
"""

import sys
import json
import asyncio
from pathlib import Path

# Set stdout encoding to UTF-8 to handle special characters
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')
else:
    import codecs
    sys.stdout = codecs.getwriter('utf-8')(sys.stdout.detach())

# Try to import crawl4ai - if not available, provide a fallback
try:
    from crawl4ai import AsyncWebCrawler
    CRAWL4AI_AVAILABLE = True
except ImportError:
    CRAWL4AI_AVAILABLE = False

async def scrape_url(url, extraction_strategy=None):
    """
    Scrape a URL using Crawl4AI with enhanced settings for verification bypass
    
    Args:
        url (str): URL to scrape
        extraction_strategy (dict): Optional extraction strategy
    
    Returns:
        dict: Scraping result with markdown, structured data, and metadata
    """
    if not CRAWL4AI_AVAILABLE:
        return {
            "success": False,
            "error": "Crawl4AI is not installed. Please install it using: pip install crawl4ai"
        }
    
    crawler = None
    try:
        # Enhanced configuration for handling verification challenges
        crawler = AsyncWebCrawler(
            verbose=False,
            browser_type="chromium",  # Using Chromium for better compatibility
            headless=True,  # Set to False for debugging verification issues
            timeout=45000,  # Reduced timeout to prevent hanging
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        )
        
        await crawler.__aenter__()
        
        # Single attempt with shorter timeout to prevent hanging
        result = await crawler.arun(
            url=url,
            extraction_strategy=extraction_strategy,
            bypass_cache=True,
            process_iframes=True,
            remove_overlay_elements=True,
            wait_for="body",  # Wait for body to be loaded
            delay_before_return_html=2,  # Additional delay for JavaScript to execute
            page_timeout=40000  # Reduced page-specific timeout
        )
        
        if result.success:
            # Extract structured data if available
            structured_data = {}
            if hasattr(result, 'extracted_content') and result.extracted_content:
                try:
                    structured_data = json.loads(result.extracted_content)
                except json.JSONDecodeError:
                    structured_data = {"extracted_content": result.extracted_content}
            
            return {
                "success": True,
                "data": {
                    "markdown": result.markdown,
                    "html": result.html,
                    "cleaned_html": result.cleaned_html,
                    "json": structured_data,
                    "url": result.url,
                    "title": getattr(result, 'title', ''),
                    "media": getattr(result, 'media', {}),
                    "links": getattr(result, 'links', {}),
                    "metadata": getattr(result, 'metadata', {})
                }
            }
        else:
            return {
                "success": False,
                "error": f"Failed to scrape URL: {result.error_message if hasattr(result, 'error_message') else 'Unknown error'}"
            }
            
    except Exception as e:
        return {
            "success": False,
            "error": f"Error during scraping: {str(e)}"
        }
    finally:
        # Ensure browser cleanup even if an exception occurs
        if crawler is not None:
            try:
                await crawler.__aexit__(None, None, None)
            except Exception as cleanup_error:
                print(f"Error during crawler cleanup: {cleanup_error}", file=sys.stderr)

def main():
    """Main function to handle command line arguments"""
    if len(sys.argv) < 2:
        print(json.dumps({
            "success": False,
            "error": "URL argument is required"
        }))
        sys.exit(1)
    
    url = sys.argv[1]
    extraction_strategy = None
    
    # Check if extraction strategy is provided as JSON
    if len(sys.argv) > 2:
        try:
            extraction_strategy = json.loads(sys.argv[2])
        except json.JSONDecodeError:
            print(json.dumps({
                "success": False,
                "error": "Invalid extraction strategy JSON"
            }))
            sys.exit(1)
    
    # Run the scraping
    try:
        result = asyncio.run(scrape_url(url, extraction_strategy))
        # Handle encoding properly for Windows
        output = json.dumps(result, ensure_ascii=False, indent=None)
        # Encode to UTF-8 and decode back to handle special characters
        print(output.encode('utf-8', errors='ignore').decode('utf-8'))
    except Exception as e:
        error_output = json.dumps({
            "success": False,
            "error": f"Script error: {str(e)}"
        })
        print(error_output.encode('utf-8', errors='ignore').decode('utf-8'))
        sys.exit(1)

if __name__ == "__main__":
    main()