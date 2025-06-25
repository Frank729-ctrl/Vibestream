import React, { useState, useEffect, useRef } from 'react';
   import Poll from './Poll';
   import axios from 'axios';
   import io from 'socket.io-client';

   const socket = io('http://localhost:5000');  // Relative connection for Heroku

   function Room({ username, isHost }) {
     const [users, setUsers] = useState([]);
     const [likes, setLikes] = useState([]);
     const videoRef = useRef(null);
     const audioRef = useRef(null);
     const peerConnections = useRef({});

     useEffect(() => {
       // Fetch users (host only)
       axios.get('/api/users', { params: { username } }).then((response) => {
         setUsers(response.data);
       });

       // Fetch likes
       axios.get('/api/likes').then((response) => {
         setLikes(response.data.likes);
       });

       // Play background audio after user interaction
       const playAudio = () => {
         if (audioRef.current) {
           audioRef.current.play().catch((err) => console.error('Audio Error:', err));
         }
       };
       document.addEventListener('click', playAudio, { once: true });

       // WebRTC setup for host
       if (isHost) {
         navigator.mediaDevices.getUserMedia({ video: true, audio: true })
           .then((stream) => {
             if (videoRef.current) {
               videoRef.current.srcObject = stream;
             }
             socket.on('watcher', (id) => {
               const peerConnection = new RTCPeerConnection();
               peerConnections.current[id] = peerConnection;
               stream.getTracks().forEach((track) => peerConnection.addTrack(track, stream));
               peerConnection.onicecandidate = (event) => {
                 if (event.candidate) {
                   socket.emit('candidate', id, event.candidate);
                 }
               };
               peerConnection.createOffer()
                 .then((offer) => peerConnection.setLocalDescription(offer))
                 .then(() => {
                   socket.emit('offer', id, peerConnection.localDescription);
                 });
             });

             socket.on('answer', (id, description) => {
               peerConnections.current[id].setRemoteDescription(new RTCSessionDescription(description));
             });

             socket.on('candidate', (id, candidate) => {
               peerConnections.current[id].addIceCandidate(new RTCIceCandidate(candidate));
             });
           })
           .catch((err) => console.error('WebRTC Error:', err));
       } else {
         socket.emit('watcher');
         socket.on('offer', (id, description) => {
           const peerConnection = new RTCPeerConnection();
           peerConnections.current[id] = peerConnection;
           peerConnection.setRemoteDescription(new RTCSessionDescription(description));
           peerConnection.ontrack = (event) => {
             if (videoRef.current) {
               videoRef.current.srcObject = event.streams[0];
             }
           };
           peerConnection.onicecandidate = (event) => {
             if (event.candidate) {
               socket.emit('candidate', id, event.candidate);
             }
           };
           peerConnection.createAnswer()
             .then((answer) => peerConnection.setLocalDescription(answer))
             .then(() => {
               socket.emit('answer', id, peerConnection.localDescription);
             });
         });

         socket.on('candidate', (id, candidate) => {
           peerConnections.current[id].addIceCandidate(new RTCIceCandidate(candidate));
         });
       }

       // Update users and likes
       socket.on('user_update', (user) => {
         if (isHost) {
           setUsers((prev) => [...prev.filter(u => u.username !== user.username), user]);
         }
       });

       socket.on('likes_update', (data) => {
         setLikes(data.likes);
       });

       return () => {
         socket.off('watcher');
         socket.off('offer');
         socket.off('answer');
         socket.off('candidate');
         socket.off('user_update');
         socket.off('likes_update');
         document.removeEventListener('click', playAudio);
         Object.values(peerConnections.current).forEach((pc) => pc.close());
       };
     }, [isHost, username]);

     const handleLike = () => {
       axios.post('/api/likes', { username });
     };

     return (
       <div className="cozy-studio m-4">
         <h2 className="text-xl font-bold mb-4">Cozy Studio Stream</h2>
         <div className="video-player bg-gray-800 flex items-center justify-center mb-4 relative">
           <video ref={videoRef} autoPlay playsInline muted={isHost}></video>
           <div className="absolute bottom-4 left-4 text-white text-sm bg-black bg-opacity-50 px-2 py-1 rounded">
             Now Playing: SoundHelix Song 1
           </div>
         </div>
         <audio ref={audioRef} src="https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3" hidden />
         <div className="flex justify-between mt-4">
           {isHost && (
             <div>
               <h3 className="font-bold">Users Watching:</h3>
               <ul>
                 {users.map((user) => (
                   <li key={user.username}>
                     {user.username} {user.is_host && <span className="text-yellow-300">[Host]</span>}
                   </li>
                 ))}
               </ul>
             </div>
           )}
           <div>
             <h3 className="font-bold">Likes: {likes.length}</h3>
             {!isHost && (
               <button
                 onClick={handleLike}
                 className="bg-green-500 text-white px-4 py-2 rounded"
                 disabled={likes.includes(username)}
               >
                 {likes.includes(username) ? 'Liked' : 'Like Stream'}
               </button>
             )}
             <ul>
               {likes.map((liker, index) => (
                 <li key={index}>{liker}</li>
               ))}
             </ul>
           </div>
         </div>
         <Poll socket={socket} />
       </div>
     );
   }

   export default Room;