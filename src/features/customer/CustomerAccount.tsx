"use client";
import { useEffect,useState,type FormEvent } from "react";
import Link from "next/link";
import { signIn,signOut } from "next-auth/react";
import { ArrowLeft,Mail,ShieldCheck,ShoppingBag } from "lucide-react";
import styles from "./account.module.css";
type Props = {
  providers: {
    google: boolean;
    apple: boolean;
  };
  delivery: "local" | "resend" | "unavailable";
  oauthError?: boolean;
};
type Shopper={name?:string|null;email?:string|null};
export function CustomerAccount({providers,delivery,oauthError}:Props){
  const [switching,setSwitching]=useState(false);
  useEffect(()=>{if(!switching)return;const timer=setTimeout(()=>setSwitching(false),650);return()=>clearTimeout(timer);},[switching]);
  const [mode,setMode]=useState<"signin"|"signup">("signin");
  const [step,setStep]=useState<"form"|"verify"|"success">("form");
  const [busy,setBusy]=useState(false),[message,setMessage]=useState(oauthError?"Sign-in was not completed. Please use your original sign-in method or try again.":"");
  const [challenge,setChallenge]=useState(""),[email,setEmail]=useState(""),[code,setCode]=useState("");
  const [user,setUser]=useState<Shopper|null>(null),[cooldown,setCooldown]=useState(0);
  useEffect(()=>{let alive=true;fetch("/api/v1/customer/session",{cache:"no-store"}).then(r=>r.json()).then(s=>{if(alive&&s?.user)setUser(s.user);}).catch(()=>{});return()=>{alive=false;};},[]);
  useEffect(()=>{if(!cooldown)return;const timer=setTimeout(()=>setCooldown(v=>v-1),1000);return()=>clearTimeout(timer);},[cooldown]);
  const switchMode=()=>{setSwitching(true);setMode(v=>v==="signin"?"signup":"signin");setStep("form");setMessage("");setCode("");};
  async function post(action:string,body:unknown){
    const response=await fetch("/api/v1/customer/"+action,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
    const result=await response.json();if(!response.ok)throw new Error(result.error||"Please try again.");return result;
  }
  async function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();setBusy(true);setMessage("");
    const form=event.currentTarget,values=Object.fromEntries(new FormData(form));
    try{
      if(step==="verify"){await post("verify",{challengeId:challenge,code});setStep("success");setCode("");}
      else if(mode==="signup"){
        const result=await post("signup",values);setEmail(String(values.email));setChallenge(result.challengeId);setStep("verify");setCooldown(60);form.reset();
      }else{
        const result=await signIn("credentials",{email:values.email,password:values.password,redirect:false,callbackUrl:"/account"});
        if(result?.error||!result?.ok)throw new Error("Email or password is incorrect, or sign-in is temporarily limited.");
        const session=await fetch("/api/v1/customer/session",{cache:"no-store"}).then(r=>r.json());
        if(!session.user)throw new Error("Unable to start your session. Please retry.");
        setUser(session.user);form.reset();
      }
    }catch(error){setMessage(error instanceof Error?error.message:"Please try again.");}finally{setBusy(false);}
  }
  async function resend(){setBusy(true);setMessage("");try{await post("resend",{challengeId:challenge});setCooldown(60);setMessage(delivery==="local"?"A new test code is in the local outbox.":"If eligible, a new code has been sent.");}catch(error){setMessage(error instanceof Error?error.message:"Please retry.");}finally{setBusy(false);}}
  return <main className={styles.page}>
    <nav className={styles.navigation}><Link href="/"><ArrowLeft size={18}/> Back to deals</Link><Link href="/" className={styles.brand}>MetaDeals<span>4U</span></Link></nav>
    {user?<section className={styles.success}><ShieldCheck size={44}/><h1>Welcome, {user.name}</h1><p>You’re signed in as {user.email}.</p><Link href="/" className={styles.primary}>Explore deals</Link><button onClick={async()=>{await signOut({redirect:false});setUser(null);}}>Sign out</button></section>:
    <section className={`${styles.card} ${switching?styles.switching:""} ${mode==="signup"?styles.signup:""}`} aria-label="Your MetaDeals4U account" aria-busy={busy}>
      <div className={styles.formPanel}>
        {step==="success"?<div className={styles.success}><ShieldCheck size={44}/><h1>Account created!</h1><p>Your email is verified. You can now sign in to MetaDeals4U.</p><button className={styles.primary} onClick={()=>{setMode("signin");setStep("form");setMessage("");}}>Sign in to your account</button></div>:
        <form onSubmit={submit} key={mode+step}>
          <span className={styles.eyebrow}>{step==="verify"?"ONE LAST STEP":"SMART SHOPPING STARTS HERE"}</span>
          <h1>{step==="verify"?"Verify your email":mode==="signup"?"Create account":"Welcome back"}</h1>
          <p>{step==="verify"?`Enter the six-digit code for ${email}.`:mode==="signup"?"Join MetaDeals4U and discover your next favourite deal.":"Sign in to your MetaDeals4U account."}</p>
          {step==="verify"?<>
            {delivery==="local"&&<p className={styles.notice}>Local preview: no email was sent. The test code is in the developer’s private outbox.</p>}
            <label htmlFor="otp">Verification code</label><input id="otp" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,""))} className={styles.otp}/>
            <small>Expires in 10 minutes · Maximum 5 attempts</small>
            <button className={styles.primary} disabled={busy}>{busy?"Verifying…":"Verify email"}</button>
            <button type="button" disabled={busy||cooldown>0} onClick={resend}>{cooldown? `Resend code in ${cooldown}s`:"Resend code"}</button>
            <button type="button" onClick={()=>{setStep("form");setMessage("");}}>Use another email</button>
          </>:<>
            <div className={styles.social}>
              <button
                type="button"
                className={styles.socialBtn}
                disabled={busy || !providers.google}
                onClick={() => void signIn("google", { callbackUrl: "/account" })}
                title={providers.google ? "Sign in with Google" : "Google sign-in awaiting provider credentials"}
              >
                <svg width="18" height="18" viewBox="0 0 24 24">
                  <path fill="var(--md-store-flipkart)" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="var(--md-green-600)" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="var(--md-promo-amazon-end)" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                  <path fill="var(--md-red-600)" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                </svg>
                Google
              </button>
              <button
                type="button"
                className={styles.socialBtn}
                disabled={busy || !providers.apple}
                onClick={() => void signIn("apple", { callbackUrl: "/account" })}
                title={providers.apple ? "Sign in with Apple" : "Apple sign-in awaiting provider credentials"}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.97 6.37c.62-.75 1.04-1.8 0.92-2.85-.9.04-1.98.6-2.62 1.35-.57.65-1.07 1.72-.94 2.74 1 .08 2.02-.49 2.64-1.24z" />
                </svg>
                Apple
              </button>
            </div>
            {(!providers.google || !providers.apple) && (
              <small style={{ display: "block", textAlign: "center", marginTop: 4 }}>
                Unavailable sign-in options are awaiting provider setup.
              </small>
            )}
            <div className={styles.divider}>or continue with email</div>
            {mode==="signup"&&<><label htmlFor="name">Name</label><input id="name" name="name" autoComplete="name" minLength={2} maxLength={80} required placeholder="Your name"/></>}
            <label htmlFor="email">Email address</label><input id="email" name="email" type="email" autoComplete="email" maxLength={254} required placeholder="you@example.com"/>
            <label htmlFor="password">Password</label><input id="password" name="password" type="password" autoComplete={mode==="signup"?"new-password":"current-password"} minLength={mode==="signup"?8:1} maxLength={128} required placeholder={mode==="signup"?"At least 8 characters":"Enter your password"}/>
            {mode==="signup"&&<><label htmlFor="confirmPassword">Confirm password</label><input id="confirmPassword" name="confirmPassword" type="password" autoComplete="new-password" maxLength={128} required placeholder="Re-enter your password"/>
            {delivery==="local"&&<small>Local email preview is active. Codes go to a private test outbox.</small>}
            {delivery==="unavailable"&&<p className={styles.notice}>Email verification is awaiting configuration.</p>}</>}
            <button className={styles.primary} disabled={busy||(mode==="signup"&&delivery==="unavailable")}>{busy?"Please wait…":mode==="signup"?"Sign up":"Sign in"}</button>
            <button className={styles.mobileSwitch} type="button" onClick={switchMode}>{mode==="signin"?"New here? Create an account":"Already registered? Sign in"}</button>
          </>}
          {message&&<p role="status" className={styles.message}>{message}</p>}
        </form>}
      </div>
      <aside className={styles.welcome}>
        <ShoppingBag size={58} strokeWidth={1.3}/><h2>{mode==="signin"?"Hello, smart shopper!":"Already part of the family?"}</h2>
        <p>{mode==="signin"?"A little discovery. A lot of savings. Create your account and make yourself at home.":"Your next great find is waiting. Sign in and keep exploring MetaDeals4U."}</p>
        <button onClick={switchMode} disabled={busy}>{mode==="signin"?"Create an account":"Sign in"}</button>
        <span><Mail size={16}/> Your email stays private</span>
      </aside>
    </section>}
    <p className={styles.caption}>Deals • Offers • Best Prices</p>
  </main>;
}
