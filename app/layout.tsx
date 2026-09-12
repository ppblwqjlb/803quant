import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "803见势研究 · A股数据与信息研究平台",
  description: "数据为据，决策有衡。803见势研究聚合公开信息、市场数据、风险信号与标准化策略模型结果。",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
  openGraph: {
    title: "803见势研究 · A股数据与信息研究平台",
    description: "数据为据，决策有衡。聚合公开信息、市场数据与标准化模型结果。",
    images: [{ url: "/og.png", width: 1185, height: 622 }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
