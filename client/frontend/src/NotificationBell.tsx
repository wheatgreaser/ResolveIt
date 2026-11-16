
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import "./NotificationBell.css";

interface Notification {
    notification_id: number;
    incident_id: number;
    event_id: number;
    title: string;
    message: string;
    is_read: boolean;
    created_at: string;
}

function NotificationBell() {
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [isOpen, setIsOpen] = useState(false);
    const [loading, setLoading] = useState(false);

    const navigate = useNavigate();
    const token = localStorage.getItem("token");

    async function fetchNotifications() {
        if (!token) return;

        try {
            setLoading(true);

            const response = await fetch(
                "http://localhost:8080/incidents/notifications",
                {
                    headers: {
                        Authorization: `Bearer ${token}`
                    }
                }
            );

            if (!response.ok) {
                throw new Error("Failed to fetch notifications");
            }

            const data = await response.json();
            setNotifications(data.notifications);

        } catch (err) {
            console.error("Notification fetch error:", err);
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        fetchNotifications();

        const interval = setInterval(fetchNotifications, 30000);

        return () => clearInterval(interval);
    }, []);

    async function markAsRead(notificationId: number) {
        try {
            const response = await fetch(
                `http://localhost:8080/incidents/notifications/${notificationId}/read`,
                {
                    method: "PATCH",
                    headers: {
                        Authorization: `Bearer ${token}`
                    }
                }
            );

            if (!response.ok) {
                throw new Error("Failed to mark notification as read");
            }

            setNotifications(previous =>
                previous.map(notification =>
                    notification.notification_id === notificationId
                        ? { ...notification, is_read: true }
                        : notification
                )
            );

        } catch (err) {
            console.error("Mark as read error:", err);
        }
    }

    async function handleNotificationClick(notification: Notification) {
        await markAsRead(notification.notification_id);

        setIsOpen(false);

        navigate(`/track-incident/${notification.incident_id}`);
    }

    const unreadCount = notifications.filter(
        notification => !notification.is_read
    ).length;

    return (
        <div className="notificationContainer">

            <button
                className="notificationBell"
                onClick={() => setIsOpen(!isOpen)}
                aria-label="Notifications"
            >
                ♢

                {unreadCount > 0 && (
                    <span className="notificationBadge">
                        {unreadCount > 99 ? "99+" : unreadCount}
                    </span>
                )}
            </button>

            {isOpen && (
                <div className="notificationDropdown">

                    <div className="notificationHeader">
                        <h3>Notifications</h3>
                        <span>{unreadCount} unread</span>
                    </div>

                    {loading && notifications.length === 0 ? (
                        <p className="notificationEmpty">Loading...</p>
                    ) : notifications.length === 0 ? (
                        <p className="notificationEmpty">
                            No notifications yet.
                        </p>
                    ) : (
                        <div className="notificationList">
                            {notifications.map(notification => (
                                <button
                                    key={notification.notification_id}
                                    className={`notificationItem ${
                                        notification.is_read ? "read" : "unread"
                                    }`}
                                    onClick={() =>
                                        handleNotificationClick(notification)
                                    }
                                >
                                    <div className="notificationItemTop">
                                        <strong>{notification.title}</strong>

                                        {!notification.is_read && (
                                            <span className="unreadDot" />
                                        )}
                                    </div>

                                    <p>{notification.message}</p>

                                    <small>
                                        {new Date(
                                            notification.created_at
                                        ).toLocaleString()}
                                    </small>
                                </button>
                            ))}
                        </div>
                    )}

                </div>
            )}
        </div>
    );
}

export default NotificationBell;
