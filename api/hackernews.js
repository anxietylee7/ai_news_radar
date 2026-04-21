// api/hackernews.js - Hacker News에서 AI 관련 글 가져오기

const AI_KEYWORDS = [
  'ai', 'llm', 'gpt', 'claude', 'gemini', 'llama', 'mistral', 'anthropic', 'openai',
  'neural', 'transformer', 'diffusion', 'stable diffusion', 'midjourney', 'dalle',
  'machine learning', 'deep learning', 'vision', 'tts', 'speech', 'agent',
  'multimodal', 'rag', 'embedding', 'fine-tun', 'model', 'inference', 'prompt',
  'chatgpt', 'copilot', 'huggingface', 'langchain', 'ollama', 'sora', 'whisper'
];

const isAIRelated = (text) => {
  const lower = text.toLowerCase();
  return AI_KEYWORDS.some(keyword => lower.includes(keyword));
};

// CORS 헤더 설정 (강화)
const setCorsHeaders = (res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization');
  res.setHeader('Access-Control-Max-Age', '86400');
  res.setHeader('Access-Control-Allow-Credentials', 'false');
};

export default async function handler(req, res) {
  setCorsHeaders(res);
  
  // Preflight OPTIONS 요청 처리
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    const [topRes, newRes] = await Promise.all([
      fetch('https://hacker-news.firebaseio.com/v0/topstories.json'),
      fetch('https://hacker-news.firebaseio.com/v0/newstories.json'),
    ]);
    
    if (!topRes.ok) throw new Error(`HN top stories failed: ${topRes.status}`);
    
    const topIds = await topRes.json();
    const newIds = newRes.ok ? await newRes.json() : [];
    
    const allIds = [...new Set([...topIds.slice(0, 60), ...newIds.slice(0, 40)])];
    
    const storyPromises = allIds.map(id =>
      fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`)
        .then(r => r.json())
        .catch(() => null)
    );
    
    const stories = await Promise.all(storyPromises);
    
    const threeDaysAgo = Date.now() / 1000 - 3 * 24 * 3600;
    
    const filtered = stories
      .filter(story => 
        story && 
        story.title && 
        story.time > threeDaysAgo &&
        isAIRelated(story.title)
      )
      .slice(0, 30)
      .map(story => ({
        id: `hn-${story.id}`,
        title: story.title,
        url: story.url || `https://news.ycombinator.com/item?id=${story.id}`,
        source: 'HackerNews',
        score: story.score || 0,
        comments: story.descendants || 0,
        date: new Date(story.time * 1000).toISOString(),
        originalText: story.title,
      }));
    
    res.status(200).json({ success: true, data: filtered });
  } catch (err) {
    console.error('HN error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
}
