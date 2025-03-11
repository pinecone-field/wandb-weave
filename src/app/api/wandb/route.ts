import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    console.log('wandb route received:', payload);

    const weaveResponse = await fetch('http://127.0.0.1:5328/cgi-bin/weave', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!weaveResponse.ok) {
      const errorText = await weaveResponse.text();
      console.error('Weave error response:', errorText);
      throw new Error(`Weave evaluation failed: ${weaveResponse.statusText}\n${errorText}`);
    }

    return NextResponse.json(await weaveResponse.json());
  } catch (error) {
    console.error('Evaluation error:', error);
    return NextResponse.json({ error: 'Failed to evaluate responses' }, { status: 500 });
  }
} 