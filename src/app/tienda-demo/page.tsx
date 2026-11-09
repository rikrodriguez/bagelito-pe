import type {Metadata} from 'next';
import StoreDemo from '@/components/StoreDemo';

export const metadata: Metadata = {
  title: 'Bagelito — Tienda de prueba',
  robots: {index:false,follow:false}
};

export default function StoreDemoPage() {
  return <StoreDemo />;
}
