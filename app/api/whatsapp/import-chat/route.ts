import { NextResponse } from 'next/server';
import { processImportedChat } from '@/lib/whatsapp-chat-parser';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    let chatText = '';
    let targetGroup = '';
    let enforceDateFilter = false;

    const contentType = req.headers.get('content-type') || '';

    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      const file = formData.get('file') as File | null;
      if (file) {
        chatText = await file.text();
      } else {
        chatText = (formData.get('chatText') as string) || '';
      }
      targetGroup = (formData.get('targetGroup') as string) || '';
      enforceDateFilter = formData.get('enforceDateFilter') === 'true';
    } else {
      const body = await req.json();
      chatText = body.chatText || '';
      targetGroup = body.targetGroup || '';
      enforceDateFilter = !!body.enforceDateFilter;
    }

    if (!chatText || !chatText.trim()) {
      return NextResponse.json(
        {
          success: false,
          error: 'Teks chat atau file .txt tidak boleh kosong. Silakan upload file export chat WhatsApp atau tempel teks chat.',
        },
        { status: 400 }
      );
    }

    const result = processImportedChat(chatText, targetGroup || undefined, {
      enforceDateFilter,
    });

    return NextResponse.json(result);
  } catch (err: any) {
    console.error('[API /api/whatsapp/import-chat] Error:', err);
    return NextResponse.json(
      {
        success: false,
        error: err.message || 'Gagal memproses import chat WhatsApp',
      },
      { status: 500 }
    );
  }
}
