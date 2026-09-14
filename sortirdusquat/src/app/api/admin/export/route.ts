import { NextResponse } from 'next/server';
import { isSignedIn, toCsv } from '@/lib/admin';
import { allRows } from '@/lib/supabase';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  if (!(await isSignedIn())) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const table = new URL(request.url).searchParams.get('table');
  if (table !== 'pledges' && table !== 'leads') {
    return NextResponse.json({ error: 'table' }, { status: 400 });
  }

  try {
    const rows = await allRows(table);
    const date = new Date().toISOString().slice(0, 10);
    return new NextResponse(toCsv(rows), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${table}-${date}.csv"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error('Export impossible :', error);
    return NextResponse.json({ error: 'server' }, { status: 500 });
  }
}
