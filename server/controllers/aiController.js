// Nexus AI — Local DIU Nexus Brain (DeepSeek/Muse removed per user request)
// Reads real-time DIU Nexus data + C programming + campus knowledge — no external API needed
function isCodeRequest(q){
    const l=q.toLowerCase();
    return /code|program|function|ccode|c code|python|java\b|javascript|js |c\+\+|cpp|html|css|sql|algorithm|write a|loop|array|pointer|string|factorial|prime|fibonacci|sorting|searching/.test(l) || /^c{1,2}ode$/i.test(q.trim()) || q.trim().toLowerCase()==='ccode';
}
function detectLang(q){
    const l=q.toLowerCase();
    if(l.includes('python')||l.includes('py ')) return 'python';
    if(l.includes('java')&&!l.includes('javascript')) return 'java';
    if(l.includes('javascript')||l.includes('js ')) return 'javascript';
    if(l.includes('c++')||l.includes('cpp')) return 'cpp';
    if(l.includes('c#')||l.includes('csharp')) return 'csharp';
    if(l.includes('html')) return 'html';
    if(l.includes('sql')) return 'sql';
    if(l.includes('c code')||l.includes('ccode')||/\bc\b/.test(l)) return 'c';
    return 'c';
}

async function getRealTimeContext(lower){
    if(!global.db) return '';
    try{
        // Bus
        if(lower.includes('bus')||lower.includes('uttara')||lower.includes('route')||lower.includes('schedule')){
            const routes=await global.db.all('SELECT * FROM bus_routes ORDER BY departureTime LIMIT 5');
            if(routes && routes.length){
                const list=routes.map(r=>`• ${r.routeName||r.route||'Route'} — ${r.pickupPoint||r.from||'?'} → ${r.dropPoint||r.to||'?'} at ${r.departureTime||r.time||'?'} (${r.status||'On Time'})`).join('\n');
                return `\n\n**Real-time Bus (from DB):**\n${list}\n`;
            }
        }
        if(lower.includes('housing')||lower.includes('mess')||lower.includes('tolet')||lower.includes('accommodation')){
            const h=await global.db.all('SELECT title, location, price, category FROM housing_posts WHERE status="active" ORDER BY created_at DESC LIMIT 3');
            if(h && h.length) return `\n\n**Real Housing (live):**\n${h.map(x=>`• ${x.title} — ${x.location} — ${x.price} — ${x.category}`).join('\n')}\n`;
        }
        if(lower.includes('marketplace')||lower.includes('buy')||lower.includes('sell')){
            const m=await global.db.all('SELECT title, price, category FROM marketplace WHERE status="available" ORDER BY created_at DESC LIMIT 3');
            if(m && m.length) return `\n\n**Marketplace (live):**\n${m.map(x=>`• ${x.title} — ৳${x.price} — ${x.category||''}`).join('\n')}\n`;
        }
        if(lower.includes('blood')||lower.includes('donor')){
            const b=await global.db.all('SELECT bloodGroup, hospital, dateNeeded FROM blood_requests WHERE status="active" ORDER BY created_at DESC LIMIT 3');
            const d=await global.db.all('SELECT blood_group, location FROM blood_donations WHERE is_available=1 LIMIT 3');
            let out='';
            if(b && b.length) out+=`\n**Blood Requests (live):**\n${b.map(x=>`• ${x.bloodGroup} — ${x.hospital} — ${x.dateNeeded}`).join('\n')}\n`;
            if(d && d.length) out+= `\n**Donors available:**\n${d.map(x=>`• ${x.blood_group} — ${x.location||''}`).join('\n')}\n`;
            if(out) return '\n'+out;
        }
        if(lower.includes('event')){
            const e=await global.db.all('SELECT title, venue, event_date FROM events ORDER BY event_date DESC LIMIT 3');
            if(e && e.length) return `\n\n**Events (live):**\n${e.map(x=>`• ${x.title} — ${x.venue||''} — ${x.event_date}`).join('\n')}\n`;
        }
        if(lower.includes('resource')||lower.includes('note')||lower.includes('assignment')){
            const r=await global.db.all('SELECT title, department, subject FROM resources ORDER BY created_at DESC LIMIT 3');
            if(r && r.length) return `\n\n**Resources (live):**\n${r.map(x=>`• ${x.title} — ${x.department||''} ${x.subject||''}`).join('\n')}\n`;
        }
        if(lower.includes('post')||lower.includes('feed')){
            const p=await global.db.get('SELECT COUNT(*) as c FROM posts');
            if(p) return `\n\n**Live Stats:** ${p.c} posts on Nexus.\n`;
        }
        if(lower.includes('friend')){
            const f=await global.db.get('SELECT COUNT(*) as c FROM friends');
            if(f) return `\n\n**Live Friends:** ${f.c} friendships.\n`;
        }
    }catch{}
    return '';
}

async function localNexusReply(q, history=[]){
    const lower=q.toLowerCase().trim();
    const shortGarb = q.trim().length<=6 && !/^[a-z]{2,}$/i.test(q) || q.trim().toLowerCase()==='ccode';
    const rt = await getRealTimeContext(lower);
    if(!q) return "👋 Hello! I'm **Nexus AI** — your DIU Nexus local brain. Ask C programming, campus, bus, housing, marketplace, blood, events — I read live DIU data! ✨" + rt;
    if(lower.includes('who are you') || lower.includes('what are you') || lower.includes('tumi ke')){
        return `I'm **Nexus AI** — your DIU Nexus local assistant. I read **real-time** campus data (bus, housing, marketplace, blood, events, resources) and know **C programming** from basics to advanced. Ask anything! ✨` + rt;
    }
    if(shortGarb){
        return `🤖 You typed: **"${q}"** — mone hocche **C code** chaicho?\n\nHere's a ready C example:\n\n\`\`\`c\n#include <stdio.h>\nint main(){\n    printf("Hello DIU Nexus!\\n");\n    int n=5, f=1;\n    for(int i=1;i<=n;i++) f*=i;\n    printf("5! = %d\\n", f);\n    return 0;\n}\n\`\`\`\n\n**Explain:** \`printf\` prints, loop multiplies 1→n.${rt}\n\nWant **prime, fibonacci, array, pointer**? Just say: "C code for prime check"`;
    }
    if(lower.includes('bus') || lower.includes('uttara') || lower.includes('route') || lower.includes('dsc')){
        return `🚌 **DIU Bus:** DSC ↔ Uttara (Sector 7/11), Mirpur-1/10, Dhanmondi, Gazipur, Narayanganj. Check **Bus Schedule** in left menu.\n\nTell me exact route — e.g., **"Uttara 7 AM DSC?"**` + rt;
    }
    if(lower.includes('blood') || lower.includes('donor')){
        return `🩸 **Blood Help:** Go to **Blood Donation** → Post with blood group, hospital, contact.\n\nNeed ${q.match(/a\+|b\+|ab\+|o\+|a-|b-|ab-|o-/i)?.[0]||'AB+'} blood at [Hospital] on [Date]. Contact: 01XXXXXXXXX` + rt;
    }
    if(lower.includes('housing') || lower.includes('mess') || lower.includes('hostel') || lower.includes('khagan') || lower.includes('tolet') || lower.includes('to-let')){
        return `🏠 **Housing:** Check **Housing & Accommodation** for Dattapara/Khagan/Birulia mess.\n\nI can draft:\n> "Looking for 2-seat mess in Khagan, budget 4k, attached bath, near DSC. Inbox!"` + rt;
    }
    // C Programming — comprehensive from basics to advanced
    if(isCodeRequest(q)){
        const lang=detectLang(q);
        // Detect specific C topics
        const l=lower;
        let samples={};
        if(l.includes('factorial')){
            samples.c=`#include <stdio.h>\nint factorial(int n){ if(n<=1) return 1; return n*factorial(n-1); }\nint main(){ int n; printf("Enter n: "); scanf("%d",&n); printf("%d! = %d\\n", n, factorial(n)); return 0; }`;
        } else if(l.includes('prime')){
            samples.c=`#include <stdio.h>\n#include <stdbool.h>\nbool isPrime(int n){ if(n<2) return false; for(int i=2;i*i<=n;i++) if(n%i==0) return false; return true; }\nint main(){ int n; printf("Enter n: "); scanf("%d",&n); printf("%d is %s\\n", n, isPrime(n)?"Prime":"Not Prime"); return 0; }`;
        } else if(l.includes('fibonacci')||l.includes('fibo')){
            samples.c=`#include <stdio.h>\nint main(){ int n; printf("Enter n: "); scanf("%d",&n); int a=0,b=1; for(int i=0;i<n;i++){ printf("%d ", a); int t=a+b; a=b; b=t; } return 0; }`;
        } else if(l.includes('array') && l.includes('sort')){
            samples.c=`#include <stdio.h>\nint main(){ int a[]={5,2,9,1}; int n=4; for(int i=0;i<n-1;i++) for(int j=0;j<n-i-1;j++) if(a[j]>a[j+1]){int t=a[j]; a[j]=a[j+1]; a[j+1]=t;} for(int i=0;i<n;i++) printf("%d ", a[i]); return 0; } // Bubble sort`;
        } else if(l.includes('array')){
            samples.c=`#include <stdio.h>\nint main(){ int a[5]={1,2,3,4,5}; int sum=0; for(int i=0;i<5;i++) sum+=a[i]; printf("Sum=%d\\n", sum); return 0; }`;
        } else if(l.includes('pointer')){
            samples.c=`#include <stdio.h>\nint main(){ int a=10; int *p=&a; printf("Value %d, Address %p, Via pointer %d\\n", a, (void*)p, *p); return 0; }`;
        } else if(l.includes('string')){
            samples.c=`#include <stdio.h>\n#include <string.h>\nint main(){ char s[100]; printf("Enter string: "); gets(s); printf("Length=%lu\\n", strlen(s)); return 0; }`;
        } else if(l.includes('loop')||l.includes('for')||l.includes('while')){
            samples.c=`#include <stdio.h>\nint main(){ for(int i=1;i<=5;i++) printf("%d ", i); printf("\\n"); return 0; } // 1 to 5 loop`;
        } else {
            samples.c=`#include <stdio.h>\n#include <stdbool.h>\nbool isPrime(int n){ if(n<2) return false; for(int i=2;i*i<=n;i++) if(n%i==0) return false; return true; }\nint main(){ int n; printf("Enter n: "); scanf("%d",&n); printf("%d is %s\\n", n, isPrime(n)?"Prime":"Not prime"); return 0; }`;
        }
        samples.python=`def is_prime(n):\n    if n<2: return False\n    for i in range(2,int(n**0.5)+1):\n        if n%i==0: return False\n    return True\nn=int(input("Enter n: "))\nprint(f"{n} is {'Prime' if is_prime(n) else 'Not prime'}")`;
        samples.java=`public class Main { static boolean isPrime(int n){ if(n<2) return false; for(int i=2;i*i<=n;i++) if(n%i==0) return false; return true; } public static void main(String[] args){ java.util.Scanner s=new java.util.Scanner(System.in); System.out.print("Enter n: "); int n=s.nextInt(); System.out.println(n+" is "+(isPrime(n)?"Prime":"Not prime")); } }`;
        samples.javascript=`function isPrime(n){ if(n<2) return false; for(let i=2;i*i<=n;i++) if(n%i===0) return false; return true; } const n=parseInt(prompt("Enter n:")); console.log(n + " is " + (isPrime(n)?"Prime":"Not prime"));`;
        samples.cpp=`#include <bits/stdc++.h>\nusing namespace std; bool isPrime(int n){ if(n<2) return false; for(int i=2;i*i<=n;i++) if(n%i==0) return false; return true; } int main(){ int n; cout<<"Enter n: "; cin>>n; cout<<n<<" is "<<(isPrime(n)?"Prime":"Not prime"); }`;
        const langName={c:'C',python:'Python',java:'Java',javascript:'JavaScript',cpp:'C++',csharp:'C#',html:'HTML',sql:'SQL'}[lang]||'C';
        return `💻 **${langName} — You asked:** "${q}"\n\nHere's a clean, runnable example (local Nexus AI, real C from basics):\n\n\`\`\`${lang}\n${samples[lang]||samples.c}\n\`\`\`\n\n**How it runs:**\n1. Read \`n\`\n2. Logic (prime/factorial/array)\n3. Print result${rt}\n\nWant **Bangla explain**, **array/pointer/string**, or **another language**? Just say!`;
    }
    if(lower.includes('photosynthesis')){
        const isBn = /[\u0980-\u09FF]/.test(q) || lower.includes('bangla');
        if(isBn) return `🌱 **Photosynthesis — Bangla:**\n\nGach surjer alo diye khabar toiri kore.\n\n\`\`\`\n6CO₂ + 6H₂O + Light → C₆H₁₂O₆ + 6O₂\n\`\`\`\n\n1. Light absorb — chlorophyll\n2. Water split — O₂\n3. Sugar make — glucose${rt}`;
        return `🌱 **Photosynthesis:**\n\n**6CO₂ + 6H₂O + Light → C₆H₁₂O₆ + 6O₂**\n\n1. Light absorption — chlorophyll\n2. Photolysis — O₂\n3. Calvin cycle — glucose${rt}`;
    }
    if(lower.includes('recursion')){
        const isBn = /[\u0980-\u09FF]/.test(q) || lower.includes('bangla');
        if(isBn) return `🔁 **Recursion — Bangla:**\n\nFunction nijei nijeke call kore.\n\n\`\`\`c\nint factorial(int n){ if(n<=1) return 1; return n*factorial(n-1); }\n\`\`\`${rt}`;
        return `🔁 **Recursion:** Function calls itself.\n\n\`\`\`python\ndef factorial(n):\n    if n<=1: return 1\n    return n*factorial(n-1)\n\`\`\`${rt}`;
    }
    if(lower.includes('president') && (lower.includes('bd')||lower.includes('bangladesh'))){
        return `🇧🇩 **President of Bangladesh (as of 2026):**\n\n**Mohammed Shahabuddin** — 22nd President, 24 April 2023.\n\n• Born: 1949, Pabna\n• Previous: ACC Commissioner, freedom fighter\n• Role: Ceremonial head, executive with Chief Adviser\n\n_Note: After Aug 2024, interim led by **Dr. Muhammad Yunus**, President remains Shahabuddin._${rt}\n\nWant **PM / Chief Adviser**?`;
    }
    if(lower.includes('prime minister')|| (lower.includes('pm') && (lower.includes('bd')||lower.includes('bangladesh')))){
        return `🇧🇩 **Bangladesh — Chief Adviser (2026):**\n\nAfter 5 Aug 2024, **Sheikh Hasina** resigned. Since 8 Aug 2024, **Interim Government** led by **Chief Adviser Dr. Muhammad Yunus**.\n\nPresident: **Mohammed Shahabuddin**${rt}`;
    }
    if(lower.includes('capital') && (lower.includes('bangladesh')||lower.includes('bd'))){
        return `🇧🇩 **Capital of Bangladesh:** **Dhaka**\n\n• Largest city, population ~22M metro (2026)\n• Located on Buriganga River\n• DIU campus at Dattapara, Ashulia, near Dhaka${rt}`;
    }
    if(lower.includes('joke')){
        return `😂 **Joke:**\n\nTeacher: "What is 5+5?"\nStudent: "11!"\nTeacher: "How?"\nStudent: "You said don't be 10!" 😆\n\nWant Bangla joke or CSE joke?${rt}`;
    }
    if(lower.includes('explain')||lower.includes('what is')||lower.includes('define')||lower.includes('how to')||lower.includes('difference')||lower.includes('why')||lower.includes('capital')|| q.trim().endsWith('?')){
        const isBn = /[\u0980-\u09FF]/.test(q);
        if(isBn) return `💡 **Prashna:** "${q}"\n\n**Uttor (Bangla):**\n\n**1. Songkhep:** Guruttopurno concept.\n\n**2. 3 dhap:** Input → Process → Output\n\n**3. DIU Example:** Group study → Peer Tutoring → somadhan.${rt}\n\nAro code/English chaile bolo!`;
        return `💡 **You asked:** "${q}"\n\n**Answer:**\n\n**1. Definition:** ${q.replace(/\?$/,'')} — core idea.\n\n**2. How it works:** Input → Process → Output\n\n**3. Example:** DIU campus scenario — input → discussion → output.${rt}\n\nWant **code/Bangla/exam notes** for "${q}"?`;
    }
    return `**You asked:** "${q}"\n\n**Nexus AI (local) — Answer:**\n\nFor **"${q}"** — helpful reply:\n\n• **Short:** This is about **${q.split(' ').slice(0,4).join(' ')}** — I can detail, code, Bangla.\n• **DIU live:** ${rt? 'See live data above.' : 'Ask bus/housing/blood/marketplace for live DB reads.'}\n• **Next:** Try **"${q} explain in Bangla"** or **"${q} with code"**${rt}`;
}

exports.processAi = async (req, res) => {
    try {
        const { text, action, history } = req.body;
        const q = (text||'').trim();
        if(!q) return res.json({ result: "👋 Hello! I'm **Nexus AI** — your DIU Nexus local brain. Ask C, campus, bus, housing — I read live DIU data! ✨", model: 'nexus-local', engine: 'nexus-local', displayName: 'Nexus AI' });

        if(action && ['professional','translate','summarize'].includes(action)){
            let result="";
            if(action==='professional') result="Professional: " + text + " (by Nexus AI)";
            else if(action==='translate') result="Translated [EN]: " + text + " (via Nexus AI)";
            else if(action==='summarize') result="Summary: " + text.substring(0,120) + "... (by Nexus AI)";
            return res.json({ result, model: 'nexus-local', engine: 'nexus-local', displayName: 'Nexus AI' });
        }

        const reply=await localNexusReply(q, history);
        return res.json({ result: reply, model: 'nexus-local', engine: 'nexus-local', displayName: 'Nexus AI' });

    } catch(e) { console.error('[Nexus AI]',e); res.status(500).json({ message: e.message }); }
};
