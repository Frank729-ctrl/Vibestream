import React, { useState, useEffect } from 'react';
   import axios from 'axios';
   import io from 'socket.io-client';

   const socket = io(); // Relative connection for Heroku

   function Poll() {
     const [poll, setPoll] = useState([]);

     useEffect(() => {
       // Fetch initial poll data
       const fetchPoll = async () => {
         try {
           const response = await axios.get('/api/poll');
           setPoll(response.data);
           console.log('Initial poll data:', response.data);
         } catch (error) {
           console.error('Poll fetch error:', error);
         }
       };
       fetchPoll();

       // Listen for poll updates
       socket.on('poll_update', (data) => {
         console.log('Received poll update:', data);
         setPoll(data);
       });

       return () => {
         socket.off('poll_update');
       };
     }, []);

     const handleVote = (option) => {
       console.log('Emitting vote for:', option);
       socket.emit('vote', { option });
     };

     return (
       <div className="poll bg-white p-4 rounded shadow-md inline-block mt-4">
         <h3 className="font-bold mb-2 text-black">What's the next song?</h3>
         {poll.map((item) => (
           <div key={item.option} className="mb-2">
             <button
               onClick={() => handleVote(item.option)}
               className="bg-blue-500 text-white px-4 py-2 rounded mr-2"
             >
               Vote {item.option}
             </button>
             <span className="text-black">{item.votes} votes</span>
           </div>
         ))}
       </div>
     );
   }

   export default Poll;