require("dotenv").config();
const express=require("express");
const cors=require("cors");
const crypto=require("crypto");
const Database=require("better-sqlite3");
const multer=require("multer");
const XLSX=require("xlsx");
const path=require("path");

const app=express();
const PORT=process.env.PORT||3000;
const db=new Database(path.join(__dirname,"parts.db"));
const upload=multer({storage:multer.memoryStorage()});

db.exec(`CREATE TABLE IF NOT EXISTS parts(
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 model TEXT NOT NULL,
 item TEXT NOT NULL,
 part_no TEXT NOT NULL,
 note TEXT DEFAULT '',
 created_at TEXT DEFAULT CURRENT_TIMESTAMP
)`);

app.use(cors());
app.use(express.json({verify:(req,res,buf)=>{req.rawBody=Buffer.from(buf)}}));
app.use(express.urlencoded({extended:true}));
app.use(express.static(path.join(__dirname,"../frontend")));

function searchParts({model="",item="",q=""}={}){
 let sql="SELECT * FROM parts WHERE 1=1", p={};
 if(model){sql+=" AND model=@model";p.model=model}
 if(item){sql+=" AND item=@item";p.item=item}
 if(q){sql+=" AND (model LIKE @q OR item LIKE @q OR part_no LIKE @q OR note LIKE @q)";p.q="%"+q+"%"}
 return db.prepare(sql+" ORDER BY id DESC").all(p);
}
function options(column,model=""){
 if(column==="item"&&model)
   return db.prepare("SELECT DISTINCT item value FROM parts WHERE model=? AND item<>'' ORDER BY item").all(model).map(x=>x.value);
 return db.prepare(`SELECT DISTINCT ${column} value FROM parts WHERE ${column}<>'' ORDER BY ${column}`).all().map(x=>x.value);
}

app.get("/health",(req,res)=>res.json({ok:true,version:"3.1"}));
app.get("/api/parts",(req,res)=>res.json(searchParts(req.query)));
app.get("/api/options",(req,res)=>{
 const model=req.query.model||"";
 res.json({models:options("model"),items:options("item"),itemsByModel:model?options("item",model):[]});
});
app.post("/api/parts",(req,res)=>{
 const {model,item,part_no,note=""}=req.body;
 if(!model||!item||!part_no)return res.status(400).json({error:"機型、項目、料號為必填"});
 const r=db.prepare("INSERT INTO parts(model,item,part_no,note) VALUES(?,?,?,?)").run(model.trim(),item.trim(),part_no.trim(),note||"");
 res.json(db.prepare("SELECT * FROM parts WHERE id=?").get(r.lastInsertRowid));
});
app.delete("/api/parts/:id",(req,res)=>{
 db.prepare("DELETE FROM parts WHERE id=?").run(req.params.id);
 res.json({ok:true});
});

app.get("/api/export.xlsx",(req,res)=>{
 const rows=db.prepare("SELECT model AS 機型,item AS 項目,part_no AS 料號,note AS 備註 FROM parts ORDER BY id").all();
 const wb=XLSX.utils.book_new();
 XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(rows),"料號資料");
 const buf=XLSX.write(wb,{type:"buffer",bookType:"xlsx"});
 res.setHeader("Content-Disposition",'attachment; filename="MDD料號資料.xlsx"');
 res.type("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet").send(buf);
});
app.get("/api/template.xlsx",(req,res)=>{
 const rows=[{機型:"A01",項目:"主板",料號:"PN-001234",備註:"標準版"}];
 const wb=XLSX.utils.book_new();
 XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(rows),"料號資料");
 const buf=XLSX.write(wb,{type:"buffer",bookType:"xlsx"});
 res.setHeader("Content-Disposition",'attachment; filename="料號匯入範本.xlsx"');
 res.type("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet").send(buf);
});
app.post("/api/import.xlsx",upload.single("file"),(req,res)=>{
 if(!req.file)return res.status(400).json({error:"請選擇 Excel 檔"});
 try{
   const wb=XLSX.read(req.file.buffer,{type:"buffer"});
   const ws=wb.Sheets[wb.SheetNames[0]];
   const rows=XLSX.utils.sheet_to_json(ws,{defval:""});
   const tx=db.transaction(items=>{
     let count=0;
     for(const r of items){
       const model=String(r.機型??r.model??"").trim();
       const item=String(r.項目??r.item??"").trim();
       const part=String(r.料號??r.part_no??"").trim();
       const note=String(r.備註??r.note??"").trim();
       if(model&&item&&part){
         db.prepare("INSERT INTO parts(model,item,part_no,note) VALUES(?,?,?,?)").run(model,item,part,note);
         count++;
       }
     }
     return count;
   });
   res.json({ok:true,count:tx(rows)});
 }catch(e){res.status(400).json({error:"Excel 匯入失敗："+e.message})}
});

app.post("/webhook",async(req,res)=>{
 const signature=req.get("x-line-signature")||"";
 const secret=process.env.LINE_CHANNEL_SECRET||"";
 const raw=req.rawBody||Buffer.from(JSON.stringify(req.body));
 const expected=crypto.createHmac("sha256",secret).update(raw).digest("base64");
 if(!secret||signature.length!==expected.length||
    !crypto.timingSafeEqual(Buffer.from(signature),Buffer.from(expected)))
   return res.status(401).send("invalid signature");
 res.sendStatus(200);
 const token=process.env.LINE_CHANNEL_ACCESS_TOKEN;
 if(!token)return;
 for(const ev of (req.body.events||[])){
   if(ev.type!=="message"||ev.message.type!=="text"||!ev.replyToken)continue;
   const text=ev.message.text.trim();
   const rows=searchParts({q:text});
   let msg=rows.length
    ?rows.slice(0,10).map(x=>`機型：${x.model}\n項目：${x.item}\n料號：${x.part_no}${x.note?"\n備註："+x.note:""}`).join("\n\n")
    :"查無料號資料";
   if(rows.length>10)msg+=`\n\n共找到 ${rows.length} 筆，先顯示前 10 筆。`;
   fetch("https://api.line.me/v2/bot/message/reply",{
     method:"POST",
     headers:{"Content-Type":"application/json","Authorization":"Bearer "+token},
     body:JSON.stringify({replyToken:ev.replyToken,messages:[{type:"text",text:msg}]})
   }).catch(()=>{});
 }
});

app.get("*",(req,res)=>res.sendFile(path.join(__dirname,"../frontend/index.html")));
app.listen(PORT,()=>console.log("MDD Part Number V3.1 running on "+PORT));
