import * as wallet from "../wallet";
let token = "";
export function clearSession() { token = ""; }
export async function post(body: Record<string,unknown>) {
  const response = await fetch("/api/protected",{method:"POST",headers:{"Content-Type":"application/json",...(token?{Authorization:`Bearer ${token}`}:{})},body:JSON.stringify(body)});
  const result = await response.json();
  if (!response.ok || !result.ok) throw new Error(result.error ?? "Protected request failed");
  return result;
}
export async function signIn(address: string) {
  token = "";
  const c = await post({operation:"auth_challenge",address});
  const xdr = await wallet.signTransaction(c.xdr,address);
  const signed = await post({operation:"auth_verify",id:c.id,xdr});
  token = signed.token;
}
