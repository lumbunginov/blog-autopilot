// self-check: baris meta harus hilang dari body, baik LF maupun CRLF
const {execSync}=require('child_process'), fs=require('fs'), os=require('os'), path=require('path');
const ROOT=require('path').join(__dirname,'..');
const MD=['# Judul Uji','','**Meta Title**: MT','**Meta Description**: MD','**URL**: /uji-crlf/','','---','','Paragraf isi.','','---','','**Keywords**: kunci utama, lain','**Category**: Blog','**Image Alt Text**: alt'].join('\n');
for(const [label,text] of [['LF',MD],['CRLF',MD.replace(/\n/g,'\r\n')]]){
 const f=path.join(os.tmpdir(),'uji-'+label+'.md');
 fs.writeFileSync(f,text);
 execSync('node "'+ROOT+'/scripts/md-to-html.js" "'+f+'"',{stdio:'pipe'});
 const j=JSON.parse(fs.readFileSync(f+'.converted.json','utf-8'));
 const bocor=/Meta Title|Meta Description|<strong>URL<\/strong>/.test(j.html);
 console.assert(!bocor, label+': baris meta bocor ke html');
 console.assert(j.meta_title==='MT', label+': meta_title salah -> '+j.meta_title);
 console.assert(j.slug==='uji-crlf', label+': slug salah -> '+j.slug);
 console.log(label, bocor?'GAGAL (meta bocor)':'OK', '| title:',j.meta_title,'| slug:',j.slug);
 fs.unlinkSync(f); fs.unlinkSync(f+'.converted.json');
}
