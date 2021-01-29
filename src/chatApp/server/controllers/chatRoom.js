const { ChatRoomModel } = require('../../../auth/models/chatRoom/chatRoom');
const UserModel = require('../../../auth/models/users/user-schema')
const chatMessageSchema = require('../../../auth/models/chatMessages/ChatMessage')
const { CHAT_ROOM_TYPES } = require('../../../auth/models/chatRoom/chatRoom')
const MongoClient = require('mongodb').MongoClient;
module.exports = {


  initiate: async (req, res) => {

    console.log("before validation ")

    const validation = makeValidation(types => ({
      payload: req.body,
      checks: {
        userIds: {
          type: types.array,
          options: { unique: true, empty: false, stringOnly: true }
        },

      }
    }));
    if (!validation.success) return res.status(400).json({ ...validation });


    const { userIds, type } = req.body;
    const chatInitiator = req.user._id;
    console.log("chatInitiator >>>", chatInitiator)

    const allUserIds = [...userIds, chatInitiator];
    console.log("allUserIds >>>", allUserIds)

    const chatRoom = await ChatRoomModel.initiateChat(allUserIds, type, chatInitiator);
    return res.status(200).json({ success: true, chatRoom });

  },






  postMessage: async (req, res) => {
    // try {
    const roomId = req.params.roomId;

    // const validation = makeValidation(types => ({
    //   payload: req.body,
    //   checks: {
    //     messageText: { type: types.string },
    //   }
    // }));
    // if (!validation.success) return res.status(400).json({ ...validation });

    const messagePayload = {
      messageText: req.body.messageText,
    };
    const currentLoggedUser = req.user._id;
    const post = await chatMessageSchema.chatMessageSchema.create({
      chatRoomId: roomId,
      message: messagePayload,
      postedByUser: currentLoggedUser,
      readByRecipients: { readByUserId: currentLoggedUser }
    });
    console.log("post id >>>", post._id)
    MongoClient.connect("mongodb://localhost/amazona", async function (err, db) {
      // const post = await chatMessageSchema.createPostInChatRoom(roomId, messagePayload, currentLoggedUser);
      // const test =  chatMessageSchema.chatMessageSchema;
      console.log(chatMessageSchema.chatMessageSchema.aggregate)
      const aggregate = await db.chatmessages.aggregate([
        // get post where _id = post._id
        { $match: { _id: post._id } },
        // do a join on another table called users, and 
        // get me a user whose _id = postedByUser
        {
          $lookup: {
            from: 'users',
            localField: 'postedByUser',
            foreignField: '_id',
            as: 'postedByUser',
          }
        },
        { $unwind: '$postedByUser' },
        // do a join on another table called chatrooms, and 
        // get me a chatroom whose _id = chatRoomId
        {
          $lookup: {
            from: 'chatrooms',
            localField: 'chatRoomId',
            foreignField: '_id',
            as: 'chatRoomInfo',
          }
        },
        { $unwind: '$chatRoomInfo' },
        { $unwind: '$chatRoomInfo.userIds' },
        // do a join on another table called users, and 
        // get me a user whose _id = userIds
        {
          $lookup: {
            from: 'users',
            localField: 'chatRoomInfo.userIds',
            foreignField: '_id',
            as: 'chatRoomInfo.userProfile',
          }
        },
        { $unwind: '$chatRoomInfo.userProfile' },
        // group data
        {
          $group: {
            _id: '$chatRoomInfo._id',
            postId: { $last: '$_id' },
            chatRoomId: { $last: '$chatRoomInfo._id' },
            message: { $last: '$message' },
            type: { $last: '$type' },
            postedByUser: { $last: '$postedByUser' },
            readByRecipients: { $last: '$readByRecipients' },
            chatRoomInfo: { $addToSet: '$chatRoomInfo.userProfile' },
            createdAt: { $last: '$createdAt' },
            updatedAt: { $last: '$updatedAt' },
          }
        }
      ]);

      const postedMsg = aggregate[0];
      console.log(aggregate)
  
      global.io.sockets.in(roomId).emit('new message', { message: postedMsg });
      return res.status(200).json({ success: true, postedMsg });
      // } catch (error) {
      //   return res.status(500).json({ success: false, error: error })
      // }
    })
  },






  getRecentConversation: async (req, res) => { },





  getConversationByRoomId: async (req, res) => {
    console.log(req.params)
    const roomId = req.params.roomId;
    const room = await ChatRoomModel.findOne({ _id: roomId })
    if (!room) {
      return res.status(400).json({
        success: false,
        message: 'No room exists for this id',
      })
    }
    const users = await UserModel.getUserByIds(room.userIds);
    const options = {
      page: parseInt(req.query.page) || 0,
      limit: parseInt(req.query.limit) || 10,
    };

    // return thte chat and users that has this room_id
    const conversation = await chatMessageSchema.chatMessageSchema.aggregate([
      { $match: { roomId } },
      { $sort: { createdAt: -1 } },
      // do a join on another table called users, and 
      // get me a user whose _id = postedByUser
      {
        $lookup: {
          from: 'users',
          localField: 'postedByUser',
          foreignField: '_id',
          as: 'postedByUser',
        }
      },
      { $unwind: "$postedByUser" },
      // apply pagination
      { $skip: options.page * options.limit },
      { $limit: options.limit },
      { $sort: { createdAt: 1 } },
    ]);

    return res.status(200).json({
      success: true,
      conversation,
      users,
    });

    //  catch (error) {
    //   return res.status(500).json({ success: false, error });
    // }

  },








  markConversationReadByRoomId: async (req, res) => {

    try {
      const { roomId } = req.params;
      const room = await ChatRoomModel.getChatRoomByRoomId(roomId)
      if (!room) {
        return res.status(400).json({
          success: false,
          message: 'No room exists for this id',
        })
      }

      const currentLoggedUser = req.user._id;
      const result = await chatMessageSchema.markMessageRead(roomId, currentLoggedUser);
      return res.status(200).json({ success: true, data: result });
    } catch (error) {
      console.log(error);
      return res.status(500).json({ success: false, error });
    }
  },








}