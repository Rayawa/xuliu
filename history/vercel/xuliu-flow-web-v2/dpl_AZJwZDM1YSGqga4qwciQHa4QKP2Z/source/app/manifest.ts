import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "序流",
    short_name: "序流",
    description: "个人工作、学习与生活流管理系统",
    start_url: "/",
    display: "standalone",
    background_color: "#f4f6f2",
    theme_color: "#536b5e",
  };
}

