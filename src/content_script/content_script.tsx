import { showNotification } from './notification'

const uploadImage = async (server: string, token: string, image: string) => {
  console.log(image)
  if (!image.startsWith("blob:")) return;
  // get bolb from image
  const blob = await (await fetch(image)).blob()

  const formData  = new FormData();
  // create UUID
  const filename = `${Date.now()}.png`
  formData.append('file', blob, `${filename}.png`);
  formData.append('i', token);
  formData.append('name', filename);

  console.log(blob)

  const res = await fetch(`${server}/api/drive/files/create`, {
    method: 'POST',
    body: formData,
  })

  const resJson = await res.json()
  const fileID = resJson["id"]

  return fileID
}

type PostOptions = {
  cw: boolean,
  token: string,
  server: string
}
 
export const postToMisskey = async (text: string, images: string[], options: PostOptions) => {
  let fileIDs: string[] = []
  if (images.length != 0) {
    showNotification('Misskeyにファイルをアップロードしています...', 'success')
    console.log(images)
    fileIDs = await Promise.all(images.map(image => uploadImage(options.server, options.token, image) ))   
  }

  const body: any = { "i": options.token }
  if (text) { body["text"] = text }
  if (fileIDs.length > 0) { body["fileIds"] = fileIDs }
  if (options.cw) { body["cw"] = "" }

  try {
    const res = await fetch(`${options.server}/api/notes/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', },
      body: JSON.stringify(body),
    })
    if (res.status != 200) {
      const errorRes = await res.json()
      const message = errorRes["error"]["message"]
      showNotification(`Misskeyへの投稿に失敗しました。${message}`, 'error')
      return;
    }
    const resJson = await res.json()
    console.log(resJson)

    showNotification('Misskeyへの投稿に成功しました。', 'success')
  } catch (e) {
    showNotification('Misskeyへの投稿に失敗しました。', 'error')
    return
  }
}

const buttonSelector = 'div[data-testid="tweetButton"], div[data-testid="tweetButtonInline"]'

const getTweetText = () => {
  const textContents = document.querySelectorAll('div[data-testid="tweetTextarea_0"] div[data-block="true"]');
  if (!textContents) return;
  const text = Array.from(textContents).map((textContent) => {
    return textContent.textContent;
  }).join('\n');

  return text;
}

const getTweetImages = () => {
  const images = document.querySelectorAll("div[data-testid='attachments'] img");
  const urls = Array.from(images).map((image) => {
    return image.getAttribute('src');
  })
  // filter null
  .filter((url) => {
    return url != null;
  })
  return urls as string[];
}

const tweetAndMisskey = async () => {
  const text = getTweetText();
  const images = getTweetImages();

  if (!text && images.length == 0) {
    showNotification('Misskeyへの投稿内容がありません', 'error')
    return;
  }

  const token = await new Promise<string>((resolve, reject) => {
    chrome.storage.sync.get(['misskey_token'], (result) => {
      const token = result.misskey_token as string;
      if (!token) { 
        showNotification('Tokenが設定されていません。', 'error')
        reject()
      } else { resolve(token) }
    })
  })

  let server = await new Promise<string>((resolve, reject) => {
    chrome.storage.sync.get(['misskey_server'], (result) => {
      resolve(result.misskey_server ?? "https://misskey.io")
    })
  })

  if (server.endsWith('/')) {
    server = server.slice(0, -1)
  }

  const cw = await new Promise<boolean>((resolve, reject) => {
    chrome.storage.sync.get(['misskey_cw'], (result) => {
      resolve(result.misskey_cw ?? false)
    })
  });

  const options = { cw, token, server }
  await postToMisskey(text ?? "", images, options);
}

const addMisskeyButton = (tweetBox: Node) => {
  const misskeyIcon = document.createElement('img')
  misskeyIcon.src = chrome.runtime.getURL('misskey_icon.png');
  misskeyIcon.style.width = '24px';
  misskeyIcon.style.height = '24px';
  misskeyIcon.style.verticalAlign = 'middle';
  misskeyIcon.style.display = 'inline-block';
  misskeyIcon.style.userSelect = 'none';
  
  const misskeybutton = document.createElement('button');
  misskeybutton.appendChild(misskeyIcon);
  misskeybutton.className = 'misskey-button';
  misskeybutton.style.backgroundColor = 'rgb(134, 179, 0)';
  misskeybutton.style.borderRadius = '9999px';
  misskeybutton.style.cursor = 'pointer';
  misskeybutton.style.height = '36px';
  misskeybutton.style.width = '36px';
  misskeybutton.style.marginLeft = '8px';
  misskeybutton.style.marginRight = '8px';
  misskeybutton.style.outline = 'none';
  misskeybutton.style.display = 'flex'
  misskeybutton.style.alignItems = 'center'
  misskeybutton.style.justifyContent = 'center'
  misskeybutton.style.border = 'none'
  misskeybutton.onclick = () => {
    // dim screen
    misskeybutton.disabled = true;
    misskeybutton.style.opacity = '0.5';
    tweetAndMisskey()
      .then(() => {
        misskeybutton.style.opacity = '1';
        misskeybutton.disabled = false;
      })
  }
  // hoverで色をかえる
  misskeybutton.onmouseover = () => {
    misskeybutton.style.backgroundColor = 'rgb(100, 134, 0)';
  }
  misskeybutton.onmouseout = () => {
    misskeybutton.style.backgroundColor = 'rgb(134, 179, 0)';
  }
  // アニメーションを有効にする。
  misskeybutton.style.transition = 'background-color 0.2s ease-in-out';
  
  tweetBox.parentElement!.insertBefore(misskeybutton, tweetBox.nextSibling);
}

// リプライボタンの文字列一覧
const replyButtonLabels = [
  "返信",
  "Reply",
  "답글",
  "回复",
  "回覆",
  "Répondre",
  "Responder",
  "Antworten",
  "Rispondi",
  "Responder",
  "Responder",
  "Antwoorden",
  "Svara",
  "Svar",
];

const observer = new MutationObserver(mutations => {
  mutations.forEach(mutation => {
      if (mutation.type !== 'childList') return;
      mutation.addedNodes.forEach((node: any) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            const tweetBox = node.querySelector(buttonSelector);
            if (!tweetBox) return;

            // リプライボタンの場合は後続の処理を行わない
            const isReplyButton =
              replyButtonLabels.indexOf(tweetBox.innerText) !== -1;
            if (isReplyButton) return;

            addMisskeyButton(tweetBox);
          }
      });
  });
});

observer.observe(document.body, { childList: true, subtree: true });
