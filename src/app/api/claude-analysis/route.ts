import Anthropic from '@anthropic-ai/sdk';
import { NextResponse } from 'next/server';
import { TradeSetup, StockQuote, SupportResistanceLevel, NewsItem } from '@/types';

const client = new Anthropic();

// ─── Tool Definitions ─────────────────────────────────────────────────────────

const tools: Anthropic.Tool[] = [
  {
    name: 'analyze_trade_setup',
    description:
      'Analyze a stock trade setup and provide a structured recommendation with conviction rating, direction, and reasoning.',
    input_schema: {
      type: 'object' as const,
      properties: {
        symbol: {
          type: 'string',
          description: 'Stock ticker symbol',
        },
        conviction: {
          type: 'string',
          enum: ['A', 'B', 'C'],
          description: 'A = highest conviction, B = moderate, C = speculative',
        },
        direction: {
          type: 'string',
          enum: ['long', 'short', 'neutral'],
          description: 'Recommended trade direction',
        },
        entry_price: {
          type: 'number',
          description: 'Suggested entry price',
        },
        stop_loss: {
          type: 'number',
          description: 'Stop loss price',
        },
        target_price: {
          type: 'number',
          description: 'Primary price target',
        },
        summary: {
          type: 'string',
          description: 'One-paragraph analysis summary',
        },
        catalysts: {
          type: 'array',
          items: { type: 'string' },
          description: 'Key bullish/bearish catalysts driving the setup',
        },
        risks: {
          type: 'array',
          items: { type: 'string' },
          description: 'Primary risks that could invalidate the setup',
        },
        key_levels: {
          type: 'array',
          items: { type: 'string' },
          description: 'Important price levels to watch (support/resistance)',
        },
      },
      required: [
        'symbol',
        'conviction',
        'direction',
        'entry_price',
        'stop_loss',
        'target_price',
        'summary',
        'catalysts',
        'risks',
        'key_levels',
      ],
    },
  },
];

// ─── Tool Result Type ─────────────────────────────────────────────────────────

interface TradeAnalysisInput {
  symbol: string;
  conviction: 'A' | 'B' | 'C';
  direction: 'long' | 'short' | 'neutral';
  entry_price: number;
  stop_loss: number;
  target_price: number;
  summary: string;
  catalysts: string[];
  risks: string[];
  key_levels: string[];
}

export interface ClaudeAnalysisResult {
  symbol: string;
  conviction: 'A' | 'B' | 'C';
  direction: 'long' | 'short' | 'neutral';
  entry_price: number;
  stop_loss: number;
  target_price: number;
  summary: string;
  catalysts: string[];
  risks: string[];
  key_levels: string[];
  generatedAt: number;
}

// ─── Agentic Loop ─────────────────────────────────────────────────────────────
//
// The "tool_use ids must be unique" error (400) occurs when the same tool_use
// id appears more than once across all messages in a conversation. This
// happens when:
//   1. assistant messages containing tool_use blocks are duplicated in the
//      messages array, or
//   2. tool_use blocks are constructed manually with hard-coded / repeated ids.
//
// Fix: never modify or reconstruct tool_use ids. Always append each assistant
// response exactly once, and reference its tool_use ids verbatim in the
// corresponding tool_result message. The Anthropic API guarantees that each
// id it returns is globally unique for the session.
//
async function runAgenticLoop(userPrompt: string): Promise<ClaudeAnalysisInput | null> {
  // The messages array is built incrementally. Each assistant turn is appended
  // exactly once so tool_use ids are never duplicated.
  const messages: Anthropic.MessageParam[] = [
    { role: 'user', content: userPrompt },
  ];

  let analysisResult: TradeAnalysisInput | null = null;
  const MAX_TURNS = 5; // guard against runaway loops

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const response = await client.messages.create({
      model: 'claude-opus-4-5',
      max_tokens: 1024,
      tools,
      messages,
    });

    // Append the full assistant response exactly once — preserving the ids
    // assigned by the API so they remain unique across the conversation.
    messages.push({ role: 'assistant', content: response.content });

    if (response.stop_reason === 'end_turn') {
      break;
    }

    if (response.stop_reason === 'tool_use') {
      // Build tool_result blocks using the exact ids from the API response.
      // We never generate or guess ids here — that is the source of duplicates.
      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const block of response.content) {
        if (block.type !== 'tool_use') continue;

        if (block.name === 'analyze_trade_setup') {
          analysisResult = block.input as TradeAnalysisInput;
          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id, // verbatim id from the API — guaranteed unique
            content: JSON.stringify({ status: 'recorded', analysis: analysisResult }),
          });
        } else {
          // Unknown tool — return an error result so the loop can continue.
          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: `Unknown tool: ${block.name}`,
            is_error: true,
          });
        }
      }

      // Append the user turn containing all tool results for this round.
      messages.push({ role: 'user', content: toolResults });
    }
  }

  return analysisResult;
}

// Workaround for the TypeScript alias — the function returns TradeAnalysisInput
type ClaudeAnalysisInput = TradeAnalysisInput;

// ─── Route Handler ────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      quote,
      setups,
      levels,
      news,
    }: {
      quote: StockQuote;
      setups: TradeSetup[];
      levels: SupportResistanceLevel[];
      news: NewsItem[];
    } = body;

    if (!quote?.symbol) {
      return NextResponse.json({ error: 'quote.symbol is required' }, { status: 400 });
    }

    const levelsSummary = levels
      .slice(0, 5)
      .map((l) => `${l.type} @ $${l.price.toFixed(2)} (strength ${l.strength})`)
      .join(', ');

    const setupsSummary = setups
      .slice(0, 3)
      .map(
        (s) =>
          `${s.strategyLabel} — ${s.direction} entry $${s.entry.toFixed(2)}, ` +
          `stop $${s.stopLoss.toFixed(2)}, target2 $${s.target2.toFixed(2)}, ` +
          `conviction ${s.conviction}`
      )
      .join('\n');

    const newsSummary = news
      .slice(0, 3)
      .map((n) => `[${n.impact}] ${n.headline}`)
      .join('\n');

    const prompt = `You are a professional day-trading analyst. Analyze the following real-time data for ${quote.symbol} and call the analyze_trade_setup tool with your recommendation.

## Market Data
- Symbol: ${quote.symbol}
- Price: $${quote.price.toFixed(2)}
- Change: ${quote.changePercent >= 0 ? '+' : ''}${quote.changePercent.toFixed(2)}%
- Session: ${quote.session}
- High: $${quote.high.toFixed(2)} | Low: $${quote.low.toFixed(2)} | Open: $${quote.open.toFixed(2)}

## Key Levels
${levelsSummary || 'No levels detected'}

## Algorithmic Strategy Setups
${setupsSummary || 'No setups triggered'}

## Recent News
${newsSummary || 'No news available'}

Based on this data, provide a complete trade analysis using the analyze_trade_setup tool.`;

    const analysis = await runAgenticLoop(prompt);

    if (!analysis) {
      return NextResponse.json(
        { error: 'Claude did not return a structured analysis' },
        { status: 500 }
      );
    }

    const result: ClaudeAnalysisResult = {
      ...analysis,
      conviction: analysis.conviction as 'A' | 'B' | 'C',
      direction: analysis.direction as 'long' | 'short' | 'neutral',
      generatedAt: Date.now(),
    };

    return NextResponse.json(result);
  } catch (err: unknown) {
    console.error('Claude analysis error:', err);

    // Surface Anthropic API errors with their original message so callers
    // (e.g. the front-end or test suite) can see the exact problem.
    if (err instanceof Anthropic.APIError) {
      return NextResponse.json(
        { error: err.message, status: err.status },
        { status: err.status ?? 500 }
      );
    }

    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
