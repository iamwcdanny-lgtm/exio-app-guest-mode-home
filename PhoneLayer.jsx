import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

// Renders bottom sheets into the phone screen (.mhc-phone) so they sit above
// the bottom nav, as a real bottom sheet does. Falls back to rendering in place.
export default function PhoneLayer({ className, children }) {
  const [host, setHost] = useState(null);
  useEffect(() => {
    setHost(document.querySelector(".mhc-phone"));
  }, []);
  const layer = <div className={className}>{children}</div>;
  return host ? createPortal(layer, host) : layer;
}
