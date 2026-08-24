'use client';

import { useParams } from 'next/navigation';
import { TicketDetail } from '@/components/TicketDetail';

export default function StaffTicketPage() {
  const params = useParams<{ id: string }>();
  return <TicketDetail id={params.id} backHref="/dashboard/tickets" />;
}
