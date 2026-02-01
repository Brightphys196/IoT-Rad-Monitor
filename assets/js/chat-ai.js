document.addEventListener('DOMContentLoaded', () => {
    const chatToggleButton = document.getElementById('chat-toggle-button');
    const chatWindow = document.getElementById('chat-window');
    const chatMessages = document.getElementById('chat-messages');
    const chatInput = document.getElementById('chat-input');
    const chatSendButton = document.getElementById('chat-send-button');
    const iconChat = chatToggleButton.querySelector('.icon-chat');
    const iconClose = chatToggleButton.querySelector('.icon-close');

    // ✨ Biến để quản lý hiệu ứng "đang gõ" của chỉ báo
    let typingIndicatorInterval = null;

    // ✨ Key lưu trữ chat trong localStorage
    const CHAT_STORAGE_KEY = 'iot_chat_history';
    const MAX_CHAT_MESSAGES = 50; // Giới hạn số tin nhắn lưu

    if (!chatToggleButton || !chatWindow || !chatMessages || !chatInput || !chatSendButton) {
        console.error("Không thể khởi tạo Chatbot: Thiếu các phần tử HTML.");
        return;
    }

    // ✨ Hàm lưu tin nhắn vào localStorage
    function saveChatMessage(sender, text) {
        try {
            const history = JSON.parse(localStorage.getItem(CHAT_STORAGE_KEY) || '[]');
            history.push({
                sender,
                text,
                timestamp: new Date().toISOString()
            });
            // Giữ tối đa MAX_CHAT_MESSAGES tin nhắn cuối
            if (history.length > MAX_CHAT_MESSAGES) {
                history.splice(0, history.length - MAX_CHAT_MESSAGES);
            }
            localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(history));
        } catch (e) {
            console.error('Lỗi lưu chat:', e);
        }
    }

    // ✨ Hàm tải lịch sử chat từ localStorage
    function loadChatHistory() {
        try {
            const history = JSON.parse(localStorage.getItem(CHAT_STORAGE_KEY) || '[]');
            if (history.length > 0) {
                // Thêm tin nhắn từ lịch sử (không lưu lại vào storage)
                history.forEach(msg => {
                    addMessageToChat(msg.sender, msg.text, false);
                });
                scrollToBottom();
            }
        } catch (e) {
            console.error('Lỗi tải lịch sử chat:', e);
        }
    }

    // ✨ Hàm xóa lịch sử chat
    function clearChatHistory() {
        localStorage.removeItem(CHAT_STORAGE_KEY);
        chatMessages.innerHTML = '';
        addMessageToChat('bot', '🗑️ Đã xóa lịch sử chat. Tôi có thể giúp gì cho bạn?', false);
    }

    const CHAT_API_ENDPOINT = 'https://z2c6um5ew3.execute-api.ap-southeast-1.amazonaws.com/chat-ai';

    chatToggleButton.addEventListener('click', () => {
        const isVisible = chatWindow.style.display === 'flex';
        if (isVisible) {
            chatWindow.classList.remove('show');
            chatWindow.style.display = 'none';
            iconChat.style.display = 'block';
            iconClose.style.display = 'none';
        } else {
            chatWindow.style.display = 'flex';
            setTimeout(() => chatWindow.classList.add('show'), 10);
            iconChat.style.display = 'none';
            iconClose.style.display = 'block';
            chatInput.focus();
        }
    });

    /**
     * ✨ Gọi API với retry logic cho lỗi 429/503
     * @param {string} url - API endpoint
     * @param {object} options - fetch options
     * @param {number} maxRetries - số lần thử lại tối đa
     * @param {number} attempt - lần thử hiện tại
     */
    const fetchWithRetry = async (url, options, maxRetries = 3, attempt = 0) => {
        try {
            const response = await fetch(url, options);

            // Nếu gặp lỗi 429 (Rate Limit), chờ 30s rồi thử lại
            if (response.status === 429 && attempt < maxRetries) {
                const delay = 30000; // Gemini yêu cầu chờ ~30s
                console.log(`Rate limit (429). Chờ ${delay / 1000}s rồi thử lại (lần ${attempt + 1}/${maxRetries})...`);
                await new Promise(resolve => setTimeout(resolve, delay));
                return fetchWithRetry(url, options, maxRetries, attempt + 1);
            }

            // Nếu gặp lỗi 503, chờ 5s rồi thử lại
            if (response.status === 503 && attempt < maxRetries) {
                const delay = 5000;
                console.log(`Service unavailable (503). Chờ ${delay / 1000}s rồi thử lại (lần ${attempt + 1}/${maxRetries})...`);
                await new Promise(resolve => setTimeout(resolve, delay));
                return fetchWithRetry(url, options, maxRetries, attempt + 1);
            }

            // Kiểm tra nếu body chứa RATE_LIMIT
            if (response.status === 500 && attempt < maxRetries) {
                const clonedResponse = response.clone();
                try {
                    const text = await clonedResponse.text();
                    if (text.includes('RATE_LIMIT')) {
                        const delay = 30000;
                        console.log(`Rate limit từ Gemini. Chờ ${delay / 1000}s rồi thử lại (lần ${attempt + 1}/${maxRetries})...`);
                        await new Promise(resolve => setTimeout(resolve, delay));
                        return fetchWithRetry(url, options, maxRetries, attempt + 1);
                    }
                } catch (e) { /* ignore */ }
            }

            return response;
        } catch (error) {
            // Retry cho lỗi network
            if (attempt < maxRetries) {
                const delay = 3000;
                console.log(`Lỗi network. Thử lại sau ${delay / 1000}s...`);
                await new Promise(resolve => setTimeout(resolve, delay));
                return fetchWithRetry(url, options, maxRetries, attempt + 1);
            }
            throw error;
        }
    };

    const handleSendMessage = async () => {
        const prompt = chatInput.value.trim();
        if (!prompt) return;

        const accessToken = localStorage.getItem('accessToken');
        if (!accessToken) {
            addMessageToChat('bot', 'Lỗi: Bạn cần đăng nhập để sử dụng tính năng này.');
            return;
        }

        addMessageToChat('user', prompt);
        chatInput.value = '';
        setTypingIndicator(true);

        try {
            const response = await fetchWithRetry(CHAT_API_ENDPOINT, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${accessToken}`
                },
                body: JSON.stringify({ prompt: prompt })
            });

            if (!response.ok) {
                const text = await response.text();
                let parsed;
                try {
                    parsed = JSON.parse(text);
                } catch (e) {
                    parsed = null;
                }
                console.error('Server responded with non-OK status', response.status, text);
                const errMsg = parsed ? (parsed.error || parsed.message || JSON.stringify(parsed)) : (text || response.statusText);
                throw new Error(`Lỗi máy chủ: ${response.status} - ${errMsg}`);
            }

            const data = await response.json();
            setTypingIndicator(false);
            addMessageToChat('bot', data.response);

        } catch (error) {
            console.error("Lỗi khi gọi API chat:", error);
            setTypingIndicator(false);

            let errorMessage = `Xin lỗi, tôi gặp lỗi: ${error.message}`;
            if (error.message.includes('503')) {
                errorMessage = 'Hệ thống AI đang bận. Vui lòng thử lại sau vài giây.';
            } else if (error.message.includes('429')) {
                errorMessage = 'Đã vượt quá giới hạn yêu cầu. Vui lòng chờ 1 phút rồi thử lại.';
            } else if (error.message.includes('504') || error.message.toLowerCase().includes('timeout')) {
                errorMessage = 'Yêu cầu mất quá nhiều thời gian. Vui lòng thử lại.';
            }
            addMessageToChat('bot', errorMessage);
        }
    };

    chatSendButton.addEventListener('click', handleSendMessage);
    chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            handleSendMessage();
        }
    });

    async function addMessageToChat(sender, text, saveToStorage = true) {
        const isBot = sender === 'bot';

        // ✨ Lưu tin nhắn vào localStorage (trừ khi đang load từ history)
        if (saveToStorage) {
            saveChatMessage(sender, text);
        }

        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${sender}-message`;

        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';

        messageDiv.appendChild(contentDiv);
        chatMessages.appendChild(messageDiv);

        if (isBot) {
            // Hiệu ứng gõ chữ cho bot (bỏ qua khi load history)
            if (saveToStorage) {
                await typeMessage(contentDiv, text);
            } else {
                contentDiv.innerHTML = markdownToHtml(text);
            }
        } else {
            contentDiv.textContent = text;
        }

        scrollToBottom();
    }

    /**
     * ✨ [MỚI] Hàm tạo hiệu ứng gõ chữ cho một phần tử.
     * @param {HTMLElement} element - Phần tử để hiển thị văn bản.
     * @param {string} text - Toàn bộ văn bản cần gõ.
     */
    async function typeMessage(element, text) {
        for (let i = 0; i < text.length; i++) {
            element.innerHTML = markdownToHtml(text.substring(0, i + 1));
            scrollToBottom();
            await new Promise(resolve => setTimeout(resolve, 20)); // Điều chỉnh tốc độ gõ ở đây (ms)
        }
        // Sau khi gõ xong, đảm bảo toàn bộ nội dung được render chính xác
        element.innerHTML = markdownToHtml(text);
    }

    /**
     * ✨ [MỚI] Chuyển đổi chuỗi Markdown đơn giản sang HTML.
     * Hỗ trợ: **in đậm**, *in nghiêng*, danh sách không thứ tự (*), và xuống dòng.
     * @param {string} text - Chuỗi văn bản Markdown.
     * @returns {string} - Chuỗi HTML đã được định dạng.
     */
    function markdownToHtml(text) {
        return text
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') // In đậm
            .replace(/\*(.*?)\*/g, '<em>$1</em>')       // In nghiêng
            .replace(/^\s*\*\s(.*)/gm, '<ul><li>$1</li></ul>') // Danh sách
            .replace(/<\/ul>\n<ul>/g, '') // Nối các danh sách liền kề
            .replace(/\n/g, '<br>'); // Xuống dòng
    }

    function setTypingIndicator(isTyping) {
        let typingIndicator = document.getElementById('typing-indicator');

        // Dọn dẹp interval cũ nếu có
        if (typingIndicatorInterval) {
            clearInterval(typingIndicatorInterval);
            typingIndicatorInterval = null;
        }

        if (isTyping) {
            if (!typingIndicator) {
                typingIndicator = document.createElement('div');
                typingIndicator.id = 'typing-indicator';
                typingIndicator.className = 'message bot-message typing';
                // Bắt đầu với một dấu chấm
                typingIndicator.innerHTML = '<div class="message-content">.</div>';
                chatMessages.appendChild(typingIndicator);
                scrollToBottom();
            }

            // ✨ [MỚI] Tạo hiệu ứng "đang suy nghĩ"
            const typingContent = typingIndicator.querySelector('.message-content');
            let dotCount = 1;
            typingIndicatorInterval = setInterval(() => {
                dotCount = (dotCount % 3) + 1; // Lặp lại từ 1, 2, 3
                typingContent.textContent = '.'.repeat(dotCount);
            }, 500); // Thay đổi 500ms một lần
        } else {
            if (typingIndicator) {
                typingIndicator.remove();
            }
        }
    }

    function scrollToBottom() {
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    // ✨ Tải lịch sử chat khi khởi tạo
    loadChatHistory();

    // ✨ Hỗ trợ lệnh /clear để xóa lịch sử
    chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && chatInput.value.trim().toLowerCase() === '/clear') {
            e.preventDefault();
            chatInput.value = '';
            clearChatHistory();
        }
    });
});