FROM node:20-slim

WORKDIR /app

# Сначала копируем package.json и ставим зависимости (кешируется)
COPY package*.json ./
RUN npm install --omit=dev

# Копируем весь исходник включая assets/fonts
COPY . .

# Railway сам подставляет PORT через переменную окружения
EXPOSE 3000

CMD ["npm", "start"]
