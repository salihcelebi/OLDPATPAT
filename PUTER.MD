Puter.js AI API Referans Rehberi



Puter.js, Puter platformu üzerinde çalışan, 500'den fazla yapay zeka modeline (OpenAI, Anthropic, Google, DeepSeek vb.) tek bir birleşik API üzerinden erişim sağlayan, geliştiriciler için devrim niteliğinde bir kütüphanedir.



0\. Geliştiriciler İçin Avantajlar



Puter.js, modern web geliştirmeyi hızlandıran iki temel özellik üzerine inşa edilmiştir:



Backendsiz (Client-Side) Mimari: Puter.js sayesinde herhangi bir sunucu (backend) kurulumu yapmanıza gerek kalmaz. API anahtarlarınızı gizlemek için proxy sunucular yazmakla uğraşmazsınız; tüm yetkilendirme ve model erişimi doğrudan tarayıcı üzerinden güvenli bir şekilde yönetilir. Bu, frontend geliştiricilerin doğrudan yapay zeka özelliklerini uygulamalarına entegre etmelerine olanak tanır.



Ücretsiz Başlangıç ve Test İmkanları: Puter, geliştiricilerin fikirlerini hayata geçirmesi için cömert bir ücretsiz kullanım katmanı sunar. Ayrıca tüm API çağrılarında kullanılabilecek testMode özelliği sayesinde, uygulama mantığınızı kurarken gerçek kredilerinizi harcamadan geliştirme yapabilirsiniz.



1\. Temel Kurulum



HTML dosyasına şu script'i ekleyerek başlanır:

<script src="https://js.puter.com/v2/"></script>



2\. Metin ve Sohbet (puter.ai.chat)



Sözdizimi: puter.ai.chat(prompt, options)



Parametreler: \* prompt: String veya Mesaj Dizisi \[{role: "user", content: "..."}]



options: {model: "gpt-5-nano", stream: true, tools: \[...]}



Görsel Analizi: Multimodal mesajlar desteklenir (type: "file" veya puter\_path).



3\. Önemli Model ve Sağlayıcılar



Puter.js üzerinden erişilebilen en popüler 4 sağlayıcı ve öne çıkan modelleri şunlardır:



1\. OpenAI



gpt-4o: En yetenekli ve dengeli amiral gemisi model.



gpt-4o-mini: Hızlı ve düşük maliyetli küçük model.



o1-preview: Gelişmiş mantık yürütme ve problem çözme odaklı.



o1-mini: Mantık yürütme odaklı, daha hızlı versiyon.



gpt-4-turbo: Bilgi birikimi geniş ve yüksek performanslı klasik model.



2\. Anthropic



claude-3-5-sonnet: Kodlama ve yaratıcı yazımda en yüksek performans.



claude-3-5-haiku: Son derece hızlı ve yetenekli kompakt model.



claude-3-opus: Karmaşık analizler için en derinlikli model.



claude-3-sonnet: Güvenilir ve hızlı orta segment model.



claude-3-haiku: Anlık yanıtlar için optimize edilmiş temel model.



3\. Google (Gemini)



gemini-1.5-pro: Çok büyük bağlam penceresi (context window) sunan model.



gemini-1.5-flash: Hızlı ve multimodal görevlerde başarılı.



gemini-1.5-flash-8b: Yüksek ölçekli ve hızlı düşük kaynaklı görevler için.



gemini-1.0-pro: Kararlı ve yaygın kullanılan profesyonel model.



gemini-ultra: Google'ın en büyük ve en güçlü hesaplama modeli.



4\. DeepSeek



deepseek-v3: Yüksek performanslı genel amaçlı chat modeli.



deepseek-r1: Mantık yürütme (reasoning) konusunda devrimsel performans.



deepseek-coder: Yazılım geliştirme ve programlama dillerine özel model.



deepseek-chat: Günlük konuşma ve asistanlık görevleri için optimize.



deepseek-reasoner: Derinlemesine düşünme gerektiren akademik görevler için.



4\. Görsel Oluşturma (puter.ai.txt2img)



Sözdizimi: puter.ai.txt2img(prompt, options)



Dönüş Değeri: Bir HTMLImageElement (Promise içinde).



Önemli Modeller: gpt-image-1.5, dall-e-3, gemini-2.5-flash-image-preview.



5\. Ses ve Konuşma



Text-to-Speech: puter.ai.txt2speech(text, options) -> HTMLAudioElement döner.



Speech-to-Text: puter.ai.speech2txt(audioSource, options) -> Transkript döner.



Speech-to-Speech: puter.ai.speech2speech(source, options) -> Ses değiştirme (ElevenLabs).



6\. Video Oluşturma (puter.ai.txt2vid)



Sözdizimi: puter.ai.txt2vid(prompt, options)



Dönüş Değeri: HTMLVideoElement. sora-2 veya together modellerini destekler.



7\. Gelişmiş Özellikler



Function Calling: tools parametresi ile fonksiyonlar tanımlanabilir. AI tool\_calls döndürürse yerel fonksiyon çalıştırılır ve sonuç geri gönderilir.



Web Search: tools: \[{type: "web\_search"}] (Sadece OpenAI modellerinde).



Test Modu: Tüm fonksiyonlarda testMode: true kullanılarak kredi harcamadan deneme yapılabilir.



Örnek Kullanım Kalıbı:



// Tamamen front-end üzerinden, sunucuya gerek duymadan çağrı yapın

puter.ai.chat("Merhaba!", {

&nbsp;   model: "gpt-5-nano",

&nbsp;   testMode: true // Geliştirme aşamasında ücretsiz test

}).then(response => {

&nbsp;   console.log(response.message.content);

});



