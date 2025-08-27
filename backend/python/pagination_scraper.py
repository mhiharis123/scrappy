#!/usr/bin/env python3
"""
Python scraper script with pagination support using Crawl4AI
This script handles web scraping with automatic pagination detection and following
"""

import sys
import json
import asyncio
import re
from urllib.parse import urljoin, urlparse
from typing import List, Dict, Optional

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

# Enhanced pagination patterns - covering more languages and variations
PAGINATION_PATTERNS = [
    # English patterns
    r'next\s*page',
    r'next\s*>',
    r'>\s*next',
    r'continue',
    r'load\s*more',
    r'view\s*more',
    r'more\s*results',
    r'show\s*more',
    r'see\s*more',
    r'pagination',
    r'next\s*\d+',
    
    # Spanish patterns
    r'siguiente',
    r'próximo',
    r'más\s*resultados',
    r'cargar\s*más',
    
    # French patterns
    r'suivant',
    r'page\s*suivante',
    r'plus\s*de\s*résultats',
    
    # German patterns
    r'nächste',
    r'weiter',
    r'mehr\s*ergebnisse',
    
    # Chinese patterns
    r'下一页',
    r'下页',
    r'更多',
    
    # Japanese patterns
    r'次へ',
    r'次のページ',
    r'もっと見る',
    
    # Korean patterns
    r'다음',
    r'다음\s*페이지',
    r'더\s*보기',
    
    # Russian patterns
    r'следующая',
    r'далее',
    r'еще',
    
    # Portuguese patterns
    r'próxima',
    r'avançar',
    r'mais\s*resultados',
    
    # Italian patterns
    r'successiva',
    r'avanti',
    r'altri\s*risultati',
    
    # Arabic patterns (common English words used)
    r'التالي',
    r'المزيد',
    
    # Generic patterns
    r'arrow.*right',
    r'chevron.*right',
    r'fa-arrow-right',
    r'fa-chevron-right',
]

async def scrape_single_page(url: str, extraction_strategy: Optional[Dict] = None) -> Dict:
    """
    Scrape a single page using Crawl4AI
    
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

def find_pagination_links(html: str, base_url: str) -> List[str]:
    """
    Enhanced pagination link detection with multiple strategies
    
    Args:
        html (str): HTML content to search
        base_url (str): Base URL for resolving relative links
        
    Returns:
        List[str]: List of pagination URLs (sorted by relevance)
    """
    pagination_candidates = {}  # URL -> confidence score
    
    # Convert to lowercase for case-insensitive matching
    html_lower = html.lower()
    
    # Strategy 1: Look for links with pagination text patterns
    link_pattern = r'<a[^>]*href\s*=\s*["\']([^"\']*)["\'][^>]*>(.*?)</a>'
    links = re.findall(link_pattern, html, re.IGNORECASE | re.DOTALL)
    
    for href, link_text in links:
        if not href.strip():
            continue
            
        link_text_clean = re.sub(r'<[^>]+>', '', link_text).strip()  # Remove HTML tags
        link_text_lower = link_text_clean.lower()
        href_lower = href.lower().strip()
        
        confidence = 0
        
        # Check for pagination keywords in link text
        for pattern in PAGINATION_PATTERNS:
            if re.search(pattern, link_text_lower, re.UNICODE):
                confidence += 10
                # Higher confidence for exact matches
                if link_text_lower == pattern.replace(r'\s*', ' ').replace(r'\d+', '').strip():
                    confidence += 5
                break
        
        # Check for numeric pagination (consecutive page numbers get higher score)
        if re.match(r'^\d+$', link_text_clean):
            confidence += 8
            # Higher confidence for numbers that look like next page
            try:
                page_num = int(link_text_clean)
                if 2 <= page_num <= 10:  # Reasonable next page numbers
                    confidence += 3
            except ValueError:
                pass
        
        # Check URL patterns that suggest pagination
        url_pagination_patterns = [
            r'[?&]page=\d+',
            r'[?&]p=\d+',
            r'[?&]offset=\d+',
            r'[?&]start=\d+',
            r'/page/\d+',
            r'/p\d+',
            r'page\d+',
            r'next',
        ]
        
        for pattern in url_pagination_patterns:
            if re.search(pattern, href_lower):
                confidence += 5
                break
        
        # Bonus for rel="next" attribute
        rel_next_pattern = r'<a[^>]*rel\s*=\s*["\']next["\'][^>]*href\s*=\s*["\']' + re.escape(href) + r'["\']'
        if re.search(rel_next_pattern, html, re.IGNORECASE):
            confidence += 15
        
        # Check for common button/navigation classes
        button_pattern = r'<a[^>]*class\s*=\s*["\'][^"\']*(?:next|pagination|pager|nav)[^"\']*["\'][^>]*href\s*=\s*["\']' + re.escape(href) + r'["\']'
        if re.search(button_pattern, html, re.IGNORECASE):
            confidence += 7
        
        # Exclude current page indicators and non-navigation links
        exclude_patterns = [
            r'current',
            r'active',
            r'disabled',
            r'javascript:',
            r'mailto:',
            r'tel:',
            r'#',
        ]
        
        should_exclude = False
        for exclude_pattern in exclude_patterns:
            if re.search(exclude_pattern, href_lower) or re.search(exclude_pattern, link_text_lower):
                should_exclude = True
                break
        
        if not should_exclude and confidence > 0:
            full_url = urljoin(base_url, href)
            # Ensure we don't add the same page we're currently on
            if full_url != base_url and full_url not in pagination_candidates:
                pagination_candidates[full_url] = confidence
            elif full_url in pagination_candidates:
                # Update with higher confidence
                pagination_candidates[full_url] = max(pagination_candidates[full_url], confidence)
    
    # Strategy 2: Look for button elements with pagination indicators
    button_pattern = r'<button[^>]*onclick\s*=\s*["\']([^"\']*)["\'][^>]*>(.*?)</button>'
    buttons = re.findall(button_pattern, html, re.IGNORECASE | re.DOTALL)
    
    for onclick_attr, button_text in buttons:
        button_text_clean = re.sub(r'<[^>]+>', '', button_text).strip()
        button_text_lower = button_text_clean.lower()
        
        for pattern in PAGINATION_PATTERNS:
            if re.search(pattern, button_text_lower, re.UNICODE):
                # Extract URL from onclick if it contains location or window operations
                url_match = re.search(r'(?:location\.href|window\.location)\s*=\s*["\']([^"\']+)["\']', onclick_attr)
                if url_match:
                    full_url = urljoin(base_url, url_match.group(1))
                    if full_url not in pagination_candidates:
                        pagination_candidates[full_url] = 8
                break
    
    # Strategy 3: Look for form submissions that might be pagination
    form_pattern = r'<form[^>]*action\s*=\s*["\']([^"\']*)["\'][^>]*>.*?<input[^>]*name\s*=\s*["\']page["\'][^>]*value\s*=\s*["\']([^"\']*)["\'][^>]*.*?</form>'
    forms = re.findall(form_pattern, html, re.IGNORECASE | re.DOTALL)
    
    for action, page_value in forms:
        if page_value and page_value.isdigit():
            # Construct URL with page parameter
            separator = '&' if '?' in action else '?'
            full_url = urljoin(base_url, f"{action}{separator}page={page_value}")
            if full_url not in pagination_candidates:
                pagination_candidates[full_url] = 6
    
    # Sort by confidence score (highest first) and return top candidates
    sorted_candidates = sorted(pagination_candidates.items(), key=lambda x: x[1], reverse=True)
    
    # Return up to 3 most confident pagination URLs
    return [url for url, confidence in sorted_candidates[:3] if confidence >= 5]

async def scrape_with_pagination(url: str, max_pages: int = 5, extraction_strategy: Optional[Dict] = None) -> Dict:
    """
    Scrape a website with pagination support
    
    Args:
        url (str): Starting URL to scrape
        max_pages (int): Maximum number of pages to scrape (default: 5)
        extraction_strategy (dict): Optional extraction strategy
        
    Returns:
        dict: Combined scraping results from all pages
    """
    if not CRAWL4AI_AVAILABLE:
        return {
            "success": False,
            "error": "Crawl4AI is not installed. Please install it using: pip install crawl4ai"
        }
    
    visited_urls = set()
    all_results = []
    current_url = url
    pages_scraped = 0
    
    try:
        while current_url and pages_scraped < max_pages:
            if current_url in visited_urls:
                break
                
            visited_urls.add(current_url)
            print(f"Scraping page {pages_scraped + 1}: {current_url}", file=sys.stderr)
            
            # Scrape current page
            result = await scrape_single_page(current_url, extraction_strategy)
            
            if not result["success"]:
                # If first page fails, return the error
                if pages_scraped == 0:
                    return result
                # Otherwise, continue with what we have
                break
            
            all_results.append(result["data"])
            pages_scraped += 1
            
            # Try to find next pagination link
            pagination_links = find_pagination_links(result["data"]["html"], current_url)
            
            # Smart link selection: prefer links that look like "next page" over numeric pages
            next_url = None
            if pagination_links:
                # First, try to find a link that clearly indicates "next"
                for link in pagination_links:
                    # Get the link text for this URL from the HTML
                    link_pattern = r'<a[^>]*href\s*=\s*["\']' + re.escape(link.replace(current_url.split('?')[0], '').replace(current_url.split('#')[0], '')) + r'["\'][^>]*>(.*?)</a>'
                    link_matches = re.findall(link_pattern, result["data"]["html"], re.IGNORECASE | re.DOTALL)
                    
                    for link_text in link_matches:
                        link_text_clean = re.sub(r'<[^>]+>', '', link_text).strip().lower()
                        # Prioritize clear "next" indicators
                        if any(pattern in link_text_clean for pattern in ['next', 'siguiente', 'suivant', 'nächste', '下一页', '次へ', '다음']):
                            next_url = link
                            break
                    
                    if next_url:
                        break
                
                # If no clear "next" link, take the first candidate (highest confidence)
                if not next_url:
                    next_url = pagination_links[0]
            
            current_url = next_url
            
            # Add a small delay between requests to be respectful to the server
            if current_url and pages_scraped < max_pages - 1:
                import asyncio
                await asyncio.sleep(1)
        
        # Combine results with page information
        combined_markdown_parts = []
        combined_html_parts = []
        combined_cleaned_html_parts = []
        
        for i, r in enumerate(all_results):
            # Add page header to markdown
            page_header = f"# Page {i + 1} - {r.get('title', 'Untitled')}\n\n*Source: {r['url']}*\n\n"
            combined_markdown_parts.append(page_header + r["markdown"])
            
            # Add page comment to HTML
            html_header = f"<!-- PAGE {i + 1}: {r.get('title', 'Untitled')} - {r['url']} -->\n\n"
            combined_html_parts.append(html_header + r["html"])
            combined_cleaned_html_parts.append(html_header + r["cleaned_html"])
        
        combined_markdown = "\n\n--- PAGE BREAK ---\n\n".join(combined_markdown_parts)
        combined_html = "\n\n<!-- PAGE BREAK -->\n\n".join(combined_html_parts)
        combined_cleaned_html = "\n\n<!-- PAGE BREAK -->\n\n".join(combined_cleaned_html_parts)
        
        # Combine structured data
        combined_json = {}
        for i, result in enumerate(all_results):
            for key, value in result["json"].items():
                if key in combined_json:
                    # If key exists, convert to list or append
                    if not isinstance(combined_json[key], list):
                        combined_json[key] = [combined_json[key]]
                    combined_json[key].append(value)
                else:
                    combined_json[key] = value
        
        # Add metadata about pagination
        combined_json["pagination_info"] = {
            "pages_scraped": pages_scraped,
            "urls_scraped": [r["url"] for r in all_results],
            "total_results": len(all_results)
        }
        
        return {
            "success": True,
            "data": {
                "markdown": combined_markdown,
                "html": combined_html,
                "cleaned_html": combined_cleaned_html,
                "json": combined_json,
                "url": url,
                "title": all_results[0].get("title", "") if all_results else "",
                "media": {k: v for result in all_results for k, v in result.get("media", {}).items()},
                "links": {k: v for result in all_results for k, v in result.get("links", {}).items()},
                "metadata": {
                    "pagination": {
                        "pages_scraped": pages_scraped,
                        "max_pages_requested": max_pages,
                        "urls": [r["url"] for r in all_results]
                    }
                }
            }
        }
        
    except Exception as e:
        return {
            "success": False,
            "error": f"Error during pagination scraping: {str(e)}"
        }

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
    use_pagination = False
    max_pages = 5
    
    # Parse additional arguments
    for i in range(2, len(sys.argv)):
        arg = sys.argv[i]
        if arg == "--pagination":
            use_pagination = True
        elif arg.startswith("--max-pages="):
            try:
                max_pages = int(arg.split("=")[1])
            except ValueError:
                print(json.dumps({
                    "success": False,
                    "error": "Invalid max-pages value"
                }))
                sys.exit(1)
        elif not extraction_strategy:
            try:
                extraction_strategy = json.loads(arg)
            except json.JSONDecodeError:
                pass  # Not a JSON argument
    
    # Run the scraping
    try:
        if use_pagination:
            result = asyncio.run(scrape_with_pagination(url, max_pages, extraction_strategy))
        else:
            result = asyncio.run(scrape_single_page(url, extraction_strategy))
        
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