const Activity = require('../models/Activity');

class ActivityService {
    static async logActivity({
        user,
        hospitalId,
        actorId,
        actorName,
        actorEmail,
        actorRole,
        patientId,
        action,
        subject,
        subjectId,
        description,
        details,
        status = 'success',
        metadata = {}
    }) {
        try {
            const activity = new Activity({
                user,
                hospitalId,
                actorId,
                actorName,
                actorEmail,
                actorRole,
                patientId,
                action,
                subject,
                subjectId,
                type: action,
                description,
                details,
                status,
                metadata
            });

            await activity.save();
            return activity;
        } catch (error) {
            console.error('Error logging activity:', error);
            // Don't throw the error as activity logging should not break the main flow
            return null;
        }
    }

    static async getActivitiesByUser(userId, limit = 20) {
        return Activity.find({ user: userId })
            .sort({ createdAt: -1 })
            .limit(limit)
            .populate('user', 'name')
            .populate('patientId', 'name')
            .lean();
    }

    static async getActivitiesByHospital(hospitalId, limit = 20) {
        return Activity.find({ hospitalId })
            .sort({ createdAt: -1 })
            .limit(limit)
            .populate('user', 'name')
            .populate('patientId', 'name')
            .lean();
    }

    static async getActivitiesByPatient(patientId, limit = 20) {
        return Activity.find({ patientId })
            .sort({ createdAt: -1 })
            .limit(limit)
            .populate('user', 'name')
            .populate('actorId', 'name')
            .lean();
    }

    static async getActivitiesWithFilter({
        hospitalId,
        userId,
        patientId,
        subject,
        action,
        status,
        startDate,
        endDate,
        includeMetadata = false,
        limit = 20,
        skip = 0
    }) {
        const query = {};
        
        if (hospitalId) query.hospitalId = hospitalId;
        if (userId) query.user = userId;
        if (patientId) query.patientId = patientId;
        if (subject) query.subject = subject;
        if (action) query.action = action;
        if (status) query.status = status;
        
        if (startDate || endDate) {
            query.createdAt = {};
            if (startDate) query.createdAt.$gte = new Date(startDate);
            if (endDate) query.createdAt.$lte = new Date(endDate);
        }

        const baseQuery = Activity.find(query)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .populate('user', 'name')
            .populate('patientId', 'name')
            .populate('actorId', 'name role');

        if (!includeMetadata) {
            baseQuery.select('-metadata');
        }

        return baseQuery.lean();
    }

    static async getActivityStats({
        hospitalId,
        startDate,
        endDate,
        groupBy = 'subject'
    }) {
        const query = {};
        if (hospitalId) query.hospitalId = hospitalId;
        
        if (startDate || endDate) {
            query.createdAt = {};
            if (startDate) query.createdAt.$gte = new Date(startDate);
            if (endDate) query.createdAt.$lte = new Date(endDate);
        }

        const groupByField = `$${groupBy}`;
        
        return Activity.aggregate([
            { $match: query },
            {
                $group: {
                    _id: groupByField,
                    count: { $sum: 1 },
                    successCount: {
                        $sum: { $cond: [{ $eq: ['$status', 'success'] }, 1, 0] }
                    },
                    warningCount: {
                        $sum: { $cond: [{ $eq: ['$status', 'warning'] }, 1, 0] }
                    },
                    errorCount: {
                        $sum: { $cond: [{ $eq: ['$status', 'error'] }, 1, 0] }
                    }
                }
            },
            {
                $project: {
                    _id: 0,
                    [groupBy]: '$_id',
                    count: 1,
                    successCount: 1,
                    warningCount: 1,
                    errorCount: 1,
                    successRate: {
                        $multiply: [
                            { $divide: ['$successCount', '$count'] },
                            100
                        ]
                    }
                }
            },
            { $sort: { count: -1 } }
        ]);
    }

    static async getActivityTimeline(hospitalId, days = 7) {
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);
        
        return Activity.aggregate([
            {
                $match: {
                    hospitalId,
                    createdAt: { $gte: startDate }
                }
            },
            {
                $group: {
                    _id: {
                        date: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
                        subject: '$subject',
                        status: '$status'
                    },
                    count: { $sum: 1 }
                }
            },
            {
                $group: {
                    _id: '$_id.date',
                    activities: {
                        $push: {
                            subject: '$_id.subject',
                            status: '$_id.status',
                            count: '$count'
                        }
                    },
                    totalCount: { $sum: '$count' }
                }
            },
            { $sort: { _id: 1 } }
        ]);
    }

    static async getRelatedActivities(activity, limit = 5) {
        if (!activity) return [];
        
        return Activity.find({
            $or: [
                { patientId: activity.patientId },
                { subject: activity.subject, subjectId: activity.subjectId }
            ],
            _id: { $ne: activity._id }
        })
        .sort({ createdAt: -1 })
        .limit(limit)
        .populate('user', 'name')
        .populate('patientId', 'name')
        .populate('actorId', 'name role')
        .lean();
    }
}

module.exports = ActivityService;