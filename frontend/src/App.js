import React, { useState, useEffect } from 'react';
   import './App.css';
   import Room from './components/Room';
   import axios from 'axios';
   import io from 'socket.io-client';

    const socket = io('http://localhost:5000');// Relative connection for Heroku

   function App() {
     const [username, setUsername] = useState('');
     const [isHost, setIsHost] = useState(false);
     const [showModal, setShowModal] = useState(true);
     const [error, setError] = useState('');

     const handleUsernameSubmit = async (e) => {
       e.preventDefault();
       const inputUsername = e.target.username.value;
       if (!/^[a-zA-Z0-9]+$/.test(inputUsername)) {
         setError('Username must contain only letters and numbers');
         return;
       }
       try {
         const response = await axios.post('/api/register', { username: inputUsername });
         setUsername(response.data.username);
         setIsHost(response.data.is_host);
         setShowModal(false);
         setError('');
       } catch (error) {
         setError(error.response?.data?.error || 'Failed to register username. Please try a different username.');
       }
     };

     return (
       <div className="App">
         <header className="bg-blue-600 text-white p-4">
           <h1 className="text-2xl font-bold">VibeStream</h1>
           {username && (
             <div className="text-sm">
               Logged in as: {username} {isHost && <span className="font-bold text-yellow-300">[Host]</span>}
             </div>
           )}
         </header>
         {showModal && (
           <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
             <div className="bg-white p-6 rounded shadow-lg">
               <h2 className="text-lg font-bold mb-4 text-black">Enter Username</h2>
               <form onSubmit={handleUsernameSubmit}>
                 <input
                   type="text"
                   name="username"
                   placeholder="Your username"
                   className="border p-2 w-full mb-4 text-black focus:outline-none focus:ring-2 focus:ring-blue-500"
                   required
                   pattern="[a-zA-Z0-9]+"
                   title="Username must contain only letters and numbers"
                   autoFocus
                 />
                 {error && <p className="text-red-500 text-sm mb-4">{error}</p>}
                 <button type="submit" className="bg-blue-500 text-white px-4 py-2 rounded">
                   Join Stream
                 </button>
               </form>
             </div>
           </div>
         )}
         <main>
           <Room username={username} isHost={isHost} socket={socket} />
         </main>
       </div>
     );
   }

   export default App;