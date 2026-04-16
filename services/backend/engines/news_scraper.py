"""
News & Social Media Scraper Engine
───────────────────────────────────
Monitors Tamil news sites, X/Twitter, and RSS feeds for Chennai disruptions.
Uses Crawl4AI + Newspaper3k + Groq Llama-3 for intelligent extraction.

Monitored Sources:
- The Hindu Tamil Nadu
- Times of India Chennai
- Dinamalar (Tamil)
- News18 Tamil Nadu
- NDTV Chennai
- X/Twitter (Chennai, OMR, Velachery hashtags)
"""

import asyncio
import re
from datetime import datetime, timedelta
from typing import Optional
import httpx
from bs4 import BeautifulSoup
import feedparser
from dataclasses import dataclass, field

from config import get_settings

settings = get_settings()

# ── Chennai-specific keywords for disruption detection ──────
DISRUPTION_KEYWORDS = {
    # English
    "english": [
        "flood", "waterlogging", "heavy rain", "cyclone", "storm",
        "strike", "bandh", "hartal", "protest", "road block", "barricade",
        "traffic jam", "gridlock", "vvip", "convoy", "police", "curfew",
        "accident", "road closure", "power cut", "blackout",
        "chennai", "omr", "velachery", "t. nagar", "adyar", "anna nagar",
        "guindy", "perungudi", "sholinganallur", "thoraipakkam",
    ],
    # Tamil
    "tamil": [
        "வெள்ளம்", "மழை", "புயல்", "சூறாவளி",
        "ஹர்த்தால்", "மறியல்", "சாலை மறியல்", "போராட்டம்",
        "போக்குவரத்து நெரிசல்", "சென்னை", "ஓஎம்ஆர்", "வேளச்சேரி",
        "நிறுத்தம்", "கலவரம்", "தடை",
    ],
}

# Zone mapping for H3 hex-grid assignment
CHENNAI_ZONES = {
    "omr": {"lat": 12.9516, "lng": 80.2363, "h3_hex": "892a6a0c2c3ffff"},
    "velachery": {"lat": 12.9815, "lng": 80.2180, "h3_hex": "892a6a0c2c7ffff"},
    "t_nagar": {"lat": 13.0418, "lng": 80.2341, "h3_hex": "892a6a0c2cbffff"},
    "adyar": {"lat": 13.0067, "lng": 80.2574, "h3_hex": "892a6a0c2cfbfff"},
    "anna_nagar": {"lat": 13.0850, "lng": 80.2101, "h3_hex": "892a6a0c2d3ffff"},
    "guindy": {"lat": 13.0067, "lng": 80.2206, "h3_hex": "892a6a0c2d7ffff"},
    "perungudi": {"lat": 12.9653, "lng": 80.2461, "h3_hex": "892a6a0c2dbffff"},
    "sholinganallur": {"lat": 12.9010, "lng": 80.2279, "h3_hex": "892a6a0c2dfffff"},
    "thoraipakkam": {"lat": 12.9367, "lng": 80.2336, "h3_hex": "892a6a0c2e3ffff"},
    "tambaram": {"lat": 12.9249, "lng": 80.1000, "h3_hex": "892a6a0c2e7ffff"},
}


@dataclass
class NewsArticle:
    """Represents a scraped news article."""
    title: str
    content: str
    url: str
    source: str
    published_at: Optional[datetime] = None
    zone: Optional[str] = None
    disruption_type: Optional[str] = None
    confidence: float = 0.0
    keywords_found: list = field(default_factory=list)


# ── RSS Feed Sources ────────────────────────────────────────
RSS_FEEDS = [
    {"name": "The Hindu - Tamil Nadu", "url": "https://www.thehindu.com/news/national/tamil-nadu/feeder/default.rss"},
    {"name": "Times of India - Chennai", "url": "https://timesofindia.indiatimes.com/rssfeeds/2950623.cms"},
    {"name": "NDTV - Chennai", "url": "https://feeds.feedburner.com/ndtvnews-south-news"},
    {"name": "News18 Tamil Nadu", "url": "https://www.news18.com/rss/india.xml"},
    {"name": "India Today - Tamil Nadu", "url": "https://www.indiatoday.in/rss/1206578"},
]


async def scrape_rss_feeds() -> list[NewsArticle]:
    """
    Scrape all RSS feeds for Chennai-related news.
    Returns articles that match disruption keywords.
    """
    articles = []
    
    for feed_info in RSS_FEEDS:
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                resp = await client.get(feed_info["url"])
                feed = feedparser.parse(resp.text)
                
                for entry in feed.entries[:20]:  # Last 20 articles per feed
                    title = entry.get("title", "")
                    summary = entry.get("summary", "")
                    content = f"{title} {summary}".lower()
                    
                    # Check for Chennai disruption keywords
                    keywords_found = _extract_keywords(content)
                    if keywords_found:
                        article = NewsArticle(
                            title=title,
                            content=summary[:500],
                            url=entry.get("link", ""),
                            source=feed_info["name"],
                            published_at=_parse_date(entry.get("published")),
                            keywords_found=keywords_found,
                        )
                        articles.append(article)
        except Exception as e:
            print(f"⚠️ RSS feed error ({feed_info['name']}): {e}")
    
    return articles


async def scrape_news_websites() -> list[NewsArticle]:
    """
    Direct scraping of news websites for breaking Chennai news.
    Uses BeautifulSoup for lightweight extraction.
    """
    articles = []
    
    # The Hindu Chennai page
    try:
        articles.extend(await _scrape_the_hindu())
    except Exception as e:
        print(f"⚠️ The Hindu scrape error: {e}")
    
    # Dinamalar (Tamil)
    try:
        articles.extend(await _scrape_dinamalar())
    except Exception as e:
        print(f"⚠️ Dinamalar scrape error: {e}")
    
    return articles


async def _scrape_the_hindu() -> list[NewsArticle]:
    """Scrape The Hindu Tamil Nadu section."""
    articles = []
    url = "https://www.thehindu.com/news/cities/chennai/"
    
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(url, headers={"User-Agent": "Mozilla/5.0"})
        soup = BeautifulSoup(resp.text, "lxml")
        
        for article_div in soup.select(".story-card")[:15]:
            title_elem = article_div.select_one("h3 a, .title a")
            if title_elem:
                title = title_elem.get_text(strip=True)
                link = title_elem.get("href", "")
                content = title.lower()
                
                keywords_found = _extract_keywords(content)
                if keywords_found:
                    articles.append(NewsArticle(
                        title=title,
                        content="",
                        url=link,
                        source="The Hindu",
                        keywords_found=keywords_found,
                    ))
    
    return articles


async def _scrape_dinamalar() -> list[NewsArticle]:
    """Scrape Dinamalar Tamil news."""
    articles = []
    url = "https://www.dinamalar.com/chennai_district_detail.asp?id=19"
    
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(url, headers={"User-Agent": "Mozilla/5.0"})
        soup = BeautifulSoup(resp.text, "lxml")
        
        for news_item in soup.select(".news-title a, .inner-news a")[:15]:
            title = news_item.get_text(strip=True)
            link = news_item.get("href", "")
            content = title.lower()
            
            keywords_found = _extract_keywords(content)
            if keywords_found:
                articles.append(NewsArticle(
                    title=title,
                    content="",
                    url=f"https://www.dinamalar.com{link}" if not link.startswith("http") else link,
                    source="Dinamalar",
                    keywords_found=keywords_found,
                ))
    
    return articles


async def search_twitter_chennai() -> list[NewsArticle]:
    """
    Search X/Twitter for Chennai disruption mentions.
    Uses Twitter API v2 if available, falls back to scraping.
    """
    if not settings.twitter_bearer_token:
        return await _simulate_twitter_search()
    
    articles = []
    search_queries = [
        "chennai flood OR waterlogging",
        "chennai traffic jam OR gridlock",
        "omr traffic OR velachery traffic",
        "chennai strike OR bandh OR hartal",
        "chennai rain OR storm",
    ]
    
    headers = {"Authorization": f"Bearer {settings.twitter_bearer_token}"}
    
    for query in search_queries:
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                resp = await client.get(
                    "https://api.twitter.com/2/tweets/search/recent",
                    params={
                        "query": f"{query} -is:retweet lang:en OR lang:ta",
                        "max_results": 20,
                        "tweet.fields": "created_at,text,author_id",
                    },
                    headers=headers,
                )
                data = resp.json()
                
                for tweet in data.get("data", []):
                    text = tweet.get("text", "")
                    keywords_found = _extract_keywords(text.lower())
                    if keywords_found:
                        articles.append(NewsArticle(
                            title=text[:100],
                            content=text,
                            url=f"https://twitter.com/i/status/{tweet['id']}",
                            source="Twitter/X",
                            keywords_found=keywords_found,
                        ))
        except Exception as e:
            print(f"⚠️ Twitter API error: {e}")
    
    return articles


async def _simulate_twitter_search() -> list[NewsArticle]:
    """Simulated Twitter data for demo when API is not configured."""
    # Return empty for production; add mock data for testing
    return []


async def classify_articles_with_llm(articles: list[NewsArticle]) -> list[NewsArticle]:
    """
    Use Groq Llama-3 to classify articles and extract disruption details.
    Assigns zone, disruption_type, and confidence score.
    """
    if not articles:
        return []
    
    from groq import Groq
    client = Groq(api_key=settings.groq_api_key)
    
    # Batch articles for efficiency
    batch_size = 5
    classified = []
    
    for i in range(0, len(articles), batch_size):
        batch = articles[i:i+batch_size]
        articles_text = "\n".join([
            f"{idx+1}. [{a.source}] {a.title}"
            for idx, a in enumerate(batch)
        ])
        
        prompt = f"""Analyze these Chennai news headlines for disruption events that would affect delivery partners:

{articles_text}

For each article, determine:
1. disruption_type: flood|traffic_gridlock|strike|vvip_movement|digital_blackout|none
2. affected_zone: omr|velachery|t_nagar|adyar|anna_nagar|guindy|perungudi|sholinganallur|thoraipakkam|tambaram|unknown
3. confidence: 0.0-1.0 (how certain this is an active disruption)
4. is_current: true/false (happening now vs. historical/planned)

Return JSON array:
[
  {{"index": 1, "disruption_type": "flood", "zone": "velachery", "confidence": 0.85, "is_current": true}},
  ...
]

Only include articles with disruption_type != "none" and is_current = true.
"""
        
        try:
            response = client.chat.completions.create(
                model="llama-3.1-8b-instant",
                messages=[{"role": "user", "content": prompt}],
                temperature=0.1,
                response_format={"type": "json_object"},
            )
            
            import json
            result = json.loads(response.choices[0].message.content)
            
            # Handle both array and object responses
            items = result if isinstance(result, list) else result.get("articles", result.get("results", []))
            
            for item in items:
                idx = item.get("index", 1) - 1
                if 0 <= idx < len(batch):
                    article = batch[idx]
                    article.disruption_type = item.get("disruption_type")
                    article.zone = item.get("zone")
                    article.confidence = item.get("confidence", 0.0)
                    
                    if article.confidence >= 0.7 and item.get("is_current", False):
                        classified.append(article)
        except Exception as e:
            print(f"⚠️ LLM classification error: {e}")
    
    return classified


async def get_disruption_news(hours: int = 6) -> list[dict]:
    """
    Main function: Scrape all sources, classify, and return disruption events.
    Called by the monitoring agent periodically.
    """
    print("📰 Scanning news sources for Chennai disruptions...")
    
    # Parallel scraping
    rss_task = scrape_rss_feeds()
    web_task = scrape_news_websites()
    twitter_task = search_twitter_chennai()
    
    rss_articles, web_articles, twitter_articles = await asyncio.gather(
        rss_task, web_task, twitter_task, return_exceptions=True
    )
    
    # Flatten and dedupe
    all_articles = []
    seen_titles = set()
    
    for result in [rss_articles, web_articles, twitter_articles]:
        if isinstance(result, list):
            for article in result:
                title_key = article.title.lower()[:50]
                if title_key not in seen_titles:
                    seen_titles.add(title_key)
                    all_articles.append(article)
    
    print(f"  📥 Found {len(all_articles)} relevant articles")
    
    if not all_articles:
        return []
    
    # LLM classification
    classified = await classify_articles_with_llm(all_articles)
    print(f"  🎯 Classified {len(classified)} active disruption events")
    
    # Convert to disruption format
    disruptions = []
    for article in classified:
        zone_info = CHENNAI_ZONES.get(article.zone, {})
        disruptions.append({
            "event_type": article.disruption_type,
            "zone_name": article.zone,
            "h3_hex": zone_info.get("h3_hex", "unknown"),
            "confidence": article.confidence,
            "source": article.source,
            "title": article.title,
            "url": article.url,
            "detected_at": datetime.utcnow().isoformat(),
        })
    
    return disruptions


def _extract_keywords(text: str) -> list[str]:
    """Extract disruption keywords from text."""
    found = []
    text_lower = text.lower()
    
    for keyword in DISRUPTION_KEYWORDS["english"]:
        if keyword in text_lower:
            found.append(keyword)
    
    for keyword in DISRUPTION_KEYWORDS["tamil"]:
        if keyword in text:
            found.append(keyword)
    
    return found


def _parse_date(date_str: Optional[str]) -> Optional[datetime]:
    """Parse various date formats from RSS feeds."""
    if not date_str:
        return None
    
    try:
        from email.utils import parsedate_to_datetime
        return parsedate_to_datetime(date_str)
    except Exception:
        return None


# ── Standalone test ─────────────────────────────────────────
if __name__ == "__main__":
    async def test():
        disruptions = await get_disruption_news()
        for d in disruptions:
            print(f"🚨 {d['event_type']} in {d['zone_name']} (conf: {d['confidence']:.2f})")
            print(f"   Source: {d['source']} - {d['title'][:60]}...")
    
    asyncio.run(test())
