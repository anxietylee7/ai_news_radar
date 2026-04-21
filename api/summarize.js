// api/summarize.js - gpt-4o-mini + Vercel KV 캐싱

import OpenAI from 'openai';
import { kv } from '@vercel/kv';
import crypto from 'crypto';

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

// 캐시 키 생성 (제목 + 내용으로 해시)
const getCacheKey = (title, content) => {
  const hash = crypto
    .createHash('md5')
    .update(`${title}::${content || ''}`)
    .digest('hex');
  return `summary:${hash}`;
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

    // 🔍 1. 캐시 확인 (24시간 유효)
    const cacheKey = getCacheKey(title, content);
    try {
      const cached = await kv.get(cacheKey);
      if (cached) {
        return res.status(200).json({
          success: true,
          cached: true,
          ...cached,
        });
      }
    } catch (cacheErr) {
      console.warn('Cache read failed:', cacheErr.message);
      // 캐시 실패해도 계속 진행
    }

    // 🤖 2. 캐시 미스 → GPT-4o-mini 호출
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 500,
      temperature: 0.2,
      messages: [
        {
          role: 'system',
          content: `당신은 AI/머신러닝 기술 뉴스를 한국어로 요약하고 분류하는 최고의 전문가입니다.

## 출력 형식
다른 설명 없이 아래 JSON 형식으로만 답변하세요:
{
  "isAIRelated": true | false,
  "summary": "한국어 요약 (규칙 준수)",
  "category": "Vision" | "LLM" | "TTS" | "Agent" | "Multimodal" | "기타"
}

## AI 관련성 판단 (isAIRelated) - 중요!
다음은 **AI 관련 주제**입니다 (true):
- AI/ML 기술, 모델, 연구, 논문
- AI 제품, 서비스 (ChatGPT, Claude, Midjourney 등)
- AI 기업 소식 (OpenAI, Anthropic, Google AI, Meta AI 등)
- AI 산업, 규제, 비즈니스, 투자
- AI 윤리, 안전성, 철학 논의
- 머신러닝 도구, 라이브러리 (LangChain, PyTorch 등)
- AI 하드웨어 (GPU, TPU, AI 칩)

다음은 **AI와 무관한 주제**입니다 (false):
- 일반 프로그래밍, 웹 개발 (AI 언급 없이)
- 자연/과학/인문학 (분재, 예술, 역사 등)
- 일반 비즈니스, 스타트업 (AI 무관)
- 생활, 취미, 엔터테인먼트
- 단순히 "AI" 글자가 우연히 포함된 단어 (bonsAI 등)

제목만 보고 AI와의 연관성이 **분명하지 않으면 false**로 판단하세요.

## 요약 작성 규칙 (isAIRelated가 true일 때만)
1. **2-3문장**으로 핵심만 간결하게
2. **자연스러운 한국어**로 작성 (직역체 금지)
3. 기술 용어는 **한글 + 영문 병기** (예: "언어 모델(LLM)")
4. 고유명사는 **원문 그대로** (GPT-4, Claude, Gemini 등)
5. 수치, 성능, 주요 특징은 **구체적으로** 포함
6. 내용이 부족하면 제목에서 추론하여 맥락 추가
7. 클릭 유도 문구 금지

isAIRelated가 false면 summary는 "AI 관련 내용이 아닙니다"로 고정

## 카테고리 분류 기준

### Vision
- 이미지 생성: Stable Diffusion, DALL-E, Midjourney, FLUX
- 이미지/영상 인식, 컴퓨터 비전, OCR
- 영상 생성: Sora, Runway, Pika
- 3D 생성, 이미지 편집, 세그멘테이션

### LLM (가장 넓게 해석)
- 언어 모델: GPT, Claude(Sonnet/Opus/Haiku), Gemini(텍스트), Llama, Mistral, Qwen, DeepSeek, Grok
- LLM 관련 기술: RAG, Fine-tuning, Prompt Engineering, Tokenization
- LLM 서비스: ChatGPT, Perplexity, Cursor, Claude Code
- LLM 산업/비즈니스/논의: AI 거품론, AI 규제, OpenAI 소식
- LLM 벤치마크, 평가, 연구
- 코딩 AI: Copilot, Codex, Claude Code

### TTS
- 음성 합성(TTS): ElevenLabs, Kokoro
- 음성 인식(ASR/STT): Whisper
- 음성 복제, 음악 생성: Suno, Udio

### Agent
- 자율 AI 에이전트: AutoGPT, BabyAGI, CrewAI
- 에이전트 프레임워크: LangChain, LangGraph
- 워크플로우 자동화, 브라우저 자동화

### Multimodal
- GPT-4o 음성 모드, Gemini Live
- Vision-Language Models, 로보틱스+언어
- 여러 입력 타입 동시 처리

### 기타
- 위 5개에 명확히 속하지 않는 AI 관련
- AI와 무관하면 이 카테고리 사용`
        },
        {
          role: 'user',
          content: `다음 글의 AI 관련성을 판단하고, AI 관련이면 요약 및 분류해주세요.\n\n제목: ${title}\n\n${content && content !== title ? `내용: ${content}` : '(본문 없음 - 제목에서 판단)'}`
        }
      ],
      response_format: { type: 'json_object' },
    });

    const result = JSON.parse(response.choices[0].message.content);
    
    const payload = {
      isAIRelated: result.isAIRelated !== false,
      summary: result.summary,
      category: result.category || '기타',
    };

    // 💾 3. 결과 캐싱 (24시간 = 86400초)
    try {
      await kv.set(cacheKey, payload, { ex: 86400 });
    } catch (cacheErr) {
      console.warn('Cache write failed:', cacheErr.message);
    }
    
    res.status(200).json({
      success: true,
      cached: false,
      ...payload,
    });
  } catch (err) {
    console.error('Summarize error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
}
