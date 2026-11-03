"use client";
import { useEffect,useState,type FormEvent } from "react";
import Link from "next/link";
import { signIn,signOut } from "next-auth/react";
import { ArrowLeft,Mail,ShieldCheck,ShoppingBag } from "lucide-react";
import styles from "./account.module.css";
type Props={providers:{google:boolean;apple:boolean};delivery:"local"|"resend"|"unavailable";oauthError?:boolean};
type Shopper={name?:string|null;email?:string|null};
export function CustomerAccount({providers,delivery,oauthError}:Props){
  const [switching,setSwitching]=useState(false);
  useEffect(()=>{if(!switching)return;const timer=setTimeout(()=>setSwitching(false),650);return()=>clearTimeout(timer);},[switching]);
  const [mode,setMode]=useState<"signin"|"signup">("signin");
  const [step,setStep]=useState<"form"|"verify"|"success">("form");
  const [busy,setBusy]=useState(false),[message,setMessage]=useState(oauthError?"Sign-in was not completed. Please use your original sign-in method or try again.":"");
  const [challenge,setChallenge]=useState(""),[email,setEmail]=useState(""),[code,setCode]=useState("");
  const [user,setUser]=useState<Shopper|null>(null),[checking,setChecking]=useState(true),[cooldown,setCooldown]=useState(0);
  useEffect(()=>{let alive=true;fetch("/api/v1/customer/session",{cache:"no-store"}).then(r=>r.json()).then(s=>{if(alive)setUser(s.user);}).catch(()=>{}).finally(()=>{if(alive)setChecking(false);});return()=>{alive=false;};},[]);
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
    <section className={`${styles.card} ${switching?styles.switching:""} ${mode==="signup"?styles.signup:""}`} aria-label="Your MetaDeals4U account" aria-busy={busy||checking}>
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
              <button type="button" disabled={busy||!providers.google} onClick={()=>void signIn("google",{callbackUrl:"/account"})}>Google</button>
              <button type="button" disabled={busy||!providers.apple} onClick={()=>void signIn("apple",{callbackUrl:"/account"})}>Apple</button>
            </div>
            {(!providers.google||!providers.apple)&&<small>Unavailable sign-in options are awaiting provider setup.</small>}
            <div className={styles.divider}>or continue with email</div>
            {mode==="signup"&&<><label htmlFor="name">Name</label><input id="name" name="name" autoComplete="name" minLength={2} maxLength={80} required placeholder="Your name"/></>}
            <label htmlFor="email">Email address</label><input id="email" name="email" type="email" autoComplete="email" maxLength={254} required placeholder="you@example.com"/>
            <label htmlFor="password">Password</label><input id="password" name="password" type="password" autoComplete={mode==="signup"?"new-password":"current-password"} minLength={mode==="signup"?8:1} maxLength={128} required placeholder={mode==="signup"?"At least 8 characters":"Enter your password"}/>
            {mode==="signup"&&<><label htmlFor="confirmPassword">Confirm password</label><input id="confirmPassword" name="confirmPassword" type="password" autoComplete="new-password" maxLength={128} required placeholder="Re-enter your password"/>
            {delivery==="local"&&<small>Local email preview is active. Codes go to a private test outbox.</small>}
            {delivery==="unavailable"&&<p className={styles.notice}>Email verification is awaiting configuration.</p>}</>}
            <button className={styles.primary} disabled={busy||checking||(mode==="signup"&&delivery==="unavailable")}>{busy?"Please wait…":mode==="signup"?"Sign up":"Sign in"}</button>
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
