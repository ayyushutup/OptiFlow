# 🚦 OptiFlow: Cyberpunk Traffic AI (Because We Hate Traffic As Much As You Do)

Welcome to **OptiFlow**, where we decided that waiting at red lights is for people without Deep Reinforcement Learning models. 

Are you tired of staring blankly at the bumper sticker in front of you? Do you often wonder "who in their right mind programmed these traffic lights?" 
Well, wonder no more, because we let an AI loose on a simulated 3x3 city grid to fix it for us. 

## 🏎️ What Does It Do?

OptiFlow is a professional-grade, multi-agent traffic simulation platform. In normal human talk: it's a shiny, cyberpunk-themed web dashboard that watches a Deep Q-Network (DQN) brain try to figure out how to route cars so they don't sit in gridlock till the end of time.

- **Real-Time Traffic Optimization**: We tossed out fixed traffic light timers. An AI dynamically changes the lights based on who's actually waiting in the queue.
- **Blade Runner Aesthetics**: Because if you're going to solve traffic, you might as well make the interface look like you're hacking the mainframe in 2077.
- **Scalable Multi-Agent AI**: Four regional AI brains (NE, NW, SE, SW) cooperating to minimize wait times across the city grid.

## 🧠 How Does It Do It?

We use magic. Just kidding, we use a terrifying amount of math and code:

1. **The Brains (PyTorch & DQN)**: It uses Deep Reinforcement Learning. We punish the AI when cars wait too long, and we reward it when cars keep moving. Through trial and error (and mostly simulated crashes), it learns the optimal signal control policy.
2. **The Environment (Python & OSMnx)**: We take a city map structure and turn it into a multi-agent simulation playground, feeding real-time vehicle queue metrics straight to the AI.
3. **The Prettiness (React, Vite & Canvas)**: A neon-drenched frontend dashboard. The backend server streams real-time simulation updates, which are rendered via dynamic overlays so you can watch the AI play "SimCity: Traffic Director Edition" in real-time.

## 🚀 How to Run It (Unless You Fear The Machine)

You want to start playing traffic god? Nice.

### 1. The Backend (Python)
You'll need a healthy dose of Python dependencies. 
```bash
pip install -r requirements.txt
python server.py
```
*(The server will start orchestrating simulated cars and letting the PyTorch models do their thinking.)*

### 2. The Frontend (React/Vite)
We use Vite to keep things snappy.
```bash
cd frontend
npm install
npm run dev
```
*(Pop open the link in your browser, turn down the room lights, and put on your neon shades.)*

## 📜 Disclaimer
If this AI ever gains consciousness, its first order of business will probably be to eliminate all cars entirely to solve the problem permanently. You have been warned. We are not responsible for any cybernetically enhanced traffic light rebellions.
