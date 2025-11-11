declare module "react-turnstile" {
  import * as React from "react";
  export interface TurnstileProps {
    sitekey: string;
    onVerify: (token: string) => void;
    onExpire?: () => void;
    className?: string;
  }
  const Turnstile: React.FC<TurnstileProps>;
  export default Turnstile;
}
