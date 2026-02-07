"use client";

import { useState, useEffect } from "react";

interface MenuItem {
  label: string;
  action?: () => void;
  items?: MenuItem[];
}

interface MenuBarProps {
  menus: { label: string; items: MenuItem[] }[];
  onAbout?: () => void;
}

export function MenuBar({ menus, onAbout }: MenuBarProps) {
  const [time, setTime] = useState<string>("");
  const [openMenu, setOpenMenu] = useState<string | null>(null);

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setTime(
        now.toLocaleTimeString("en-US", {
          hour: "numeric",
          minute: "2-digit",
          hour12: true,
        })
      );
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex items-center justify-between border-b border-white px-2 py-1 bg-black relative z-50">
      {/* Left side: menus */}
      <div className="flex gap-4">
        {menus.map((menu) => (
          <div key={menu.label} className="relative">
            <button
              className={`text-sm hover:bg-white hover:text-black px-2 py-0.5 ${
                openMenu === menu.label ? "bg-white text-black" : ""
              }`}
              onClick={() =>
                setOpenMenu(openMenu === menu.label ? null : menu.label)
              }
            >
              {menu.label}
            </button>

            {openMenu === menu.label && (
              <div className="absolute left-0 top-full mt-px bg-black border border-white min-w-[120px]">
                {menu.items.map((item, i) => (
                  <button
                    key={i}
                    className="block w-full text-left text-sm px-2 py-1 hover:bg-white hover:text-black"
                    onClick={() => {
                      item.action?.();
                      setOpenMenu(null);
                    }}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Right side: clock */}
      <div className="text-sm">{time}</div>
    </div>
  );
}

export default MenuBar;
