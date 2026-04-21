// api/summarize.js - OpenAI GPT-4o로 한국어 요약 + 카테고리 분류

import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const setCorsHeaders = (res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization');
  res.setHeader('Access-Control-Max-Age', '86400');
  res.setHeader('Access-Control-Allow-Credentials', 'false');
};

export default async function handler(req, res) {
  setCorsHeaders(res);
  
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const { title, content } = req.body;
    
    if (!title) {
      return res.status(400).json({ success: false, error: 'title is required' });
    }

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      max_tokens: 400,
      temperature: 0.3,
      messages: [
        {
          role: 'system',
          content: `당신은 AI 기술 뉴스를 한국어로 요약하고 분류하는 전문가입니다.
다음 JSON 형식으로만 답변하세요 (다른 설명 없이):
{
  "summary": "한국어로 2-3줄 요약 (핵심 기술과 중요 포인트)",
  "category": "Vision" | "LLM" | "TTS" | "Agent" | "Multimodal" | "기타"
}

카테고리 기준:
- Vision: 이미지 생성/인식, 컴퓨터 비전, Diffusion, DALL-E, Midjourney, Sora 등
- LLM: 대형 언어 모델, GPT, Claude, Llama, Mistral 등 텍스트 중심
- TTS: 음성 합성, 음성 인식, Speech, Whisper, ElevenLabs 등
- Agent: 자율 AI 에이전트, AutoGPT, LangChain, CrewAI 등
- Multimodal: 여러 모달리티 결합 (GPT-4o, Gemini 비전+텍스트+음성 등)
- 기타: 위 카테고리에 해당하지 않는 AI 관련 내용`
        },
        {
          role: 'user',
          content: `제목: ${title}\n\n내용: ${content || title}`
        }
      ],
      response_format: { type: 'json_object' },
    });

    const result = JSON.parse(response.choices[0].message.content);
    
    res.status(200).json({
      success: true,
      summary: result.summary,
      category: result.category || '기타',
    });
  } catch (err) {
    console.error('Summarize error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
}
