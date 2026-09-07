import { NextResponse } from 'next/server';
import { isWaRequirementMandatory, setWaRequirementMandatory, syncAllParticipantsWithWa } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const isMandatory = isWaRequirementMandatory();
    return NextResponse.json({ success: true, isMandatory });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { isMandatory, resync } = await req.json();

    if (isMandatory !== undefined) {
      setWaRequirementMandatory(!!isMandatory);
    }

    if (resync) {
      syncAllParticipantsWithWa();
    }

    return NextResponse.json({
      success: true,
      isMandatory: isWaRequirementMandatory(),
      message: 'Pengaturan WhatsApp giveaway berhasil diperbarui',
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
