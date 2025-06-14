import { GetServerSideProps } from "next";
import { auctionService } from "@/services/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useRouter } from "next/router";
import Image from "next/image";
import { useContext, useEffect, useState } from "react";
import { AuthContext } from "@/context/auth";
import AuctionBids from "@/components/auctions/auction-bids";
import type { Auction } from "@/types/auction";
import type { User } from "@/types/user";
import { User as UserIcon } from "lucide-react";
import { HubConnection, HubConnectionBuilder, LogLevel } from "@microsoft/signalr";
import type { Bid } from "@/types/auction";
import { formatBidTime } from "@/lib/utils";

export const getServerSideProps: GetServerSideProps = async ({ params }) => {
  const { id } = params as { id: string };

  const auction = await auctionService.getAuctionById(id as string);

  return { props: { auction } };
};

export default function Auction({ auction: initialAuction }: { auction: Auction }) {
  const router = useRouter();
  const { user } = useContext(AuthContext);
  const [auction, setAuction] = useState(initialAuction);
  const [connection, setConnection] = useState<HubConnection | null>(null);

  useEffect(() => {
    if (!user) {
      return;
    }

    const newConnection = new HubConnectionBuilder()
      .withUrl(`${process.env.NEXT_PUBLIC_API_URL}/hub`, {
        withCredentials: true
      })
      .withAutomaticReconnect()
      .configureLogging(LogLevel.Information)
      .build();

    setConnection(newConnection);

    let isComponentMounted = true;

    newConnection.start()
      .then(() => {
        if (isComponentMounted) {
          return newConnection.invoke("JoinBid", auction.id);
        }
      })
      .catch((err) => {
        if (isComponentMounted) {
          console.error("Error starting SignalR connection: ", err);
        }
      });

    // Listen for new bids
    newConnection.on("BidPlaced", (bid: Bid) => {
      if (bid.auctionId === auction.id) {
        setAuction(prevAuction => {
          const bidExists = prevAuction.bids.some(existingBid => existingBid.id === bid.id);
          if (bidExists) {
            return prevAuction;
          }
          
          return {
            ...prevAuction,
            currentPrice: bid.amount,
            bids: [...prevAuction.bids, bid]
          };
        });
      }
    });

    return () => {
      isComponentMounted = false;
      if (newConnection.state === "Connected") {
        newConnection.stop();
      }
    };
  }, [auction.id, user]);

  return (
    <>
      <div className="container mx-auto px-4 py-8">
        <div className="mb-4">
          <Button variant="outline" onClick={() => router.back()} className="mb-4">
            &larr; Back to Auctions
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="space-y-4">
            <div className="relative aspect-square overflow-hidden rounded-lg border">
              <Image
                src={auction.imageUrl || "/placeholder.svg"}
                alt={auction.title}
                fill
                className="object-cover"
                priority
              />
            </div>
          </div>

          <div className="space-y-6">
            <div>
              <h1 className="text-3xl font-bold">{auction.title}</h1>

              <div className="flex items-center mt-2 space-x-4">
                <div className="flex items-center">
                  <span className="text-sm text-muted-foreground">
                    Seller: {auction.user.username}
                  </span>
                </div>
              </div>
            </div>

            <AuctionBids
              auction={auction}
              user={user ? user as User : null}
              connection={connection}
            />

            <Tabs defaultValue="details">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="details">Details</TabsTrigger>
                <TabsTrigger value="bids">Bid History</TabsTrigger>
                <TabsTrigger value="seller">Seller Info</TabsTrigger>
              </TabsList>

              <TabsContent value="details" className="space-y-4">
                <Card>
                  <CardContent>
                    <p>{auction.description}</p>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="bids">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle>Bid History</CardTitle>
                    <CardDescription>{auction.bids.length} bids placed</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {auction.bids.length > 0 ? (
                        <div className="space-y-2">
                          {auction.bids
                            .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
                            .map((bid) => (
                              <div key={bid.id} className="flex justify-between items-center py-2 border-b last:border-0">
                                <div className="flex items-center">
                                  <UserIcon className="h-4 w-4 mr-2 text-muted-foreground" />
                                  <span>{bid.user.username}</span>
                                </div>
                                <div className="flex items-center gap-4">
                                  <span className="font-medium">${bid.amount}</span>
                                  <span className="text-sm text-muted-foreground">
                                    {formatBidTime(bid.time)}
                                  </span>
                                </div>
                              </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-center text-muted-foreground py-4">No bids yet. Be the first to bid!</p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="seller">
                <Card>
                  <CardHeader>
                    <CardTitle>Seller Information</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center space-x-4">
                      <div>
                        <p className="font-medium">{auction.user.username}</p>
                        <p className="text-sm text-muted-foreground">Seller Rating: 5/5</p>
                      </div>
                    </div>
                    <Button variant="outline" className="w-full">
                      Contact Seller
                    </Button>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>
    </>
  )
}