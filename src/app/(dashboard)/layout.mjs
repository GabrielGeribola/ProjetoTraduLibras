import Navbar from '@/components/navbar/navbar';

export default function DashboardLayout({ children }) {
  return (
    <>
      <Navbar />
      <main className="flex-1 pt-16">{children}</main>
    </>
  );
}
