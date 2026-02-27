#!/usr/bin/env python3
"""Generate AWS architecture diagram with official AWS icons — clean layout."""

from diagrams import Diagram, Cluster, Edge
from diagrams.aws.compute import Lambda
from diagrams.aws.database import DynamodbTable, DynamodbItems
from diagrams.aws.integration import SQS
from diagrams.aws.network import APIGateway
import os

os.chdir(os.path.dirname(os.path.abspath(__file__)))

graph_attr = {
    "fontsize": "13",
    "fontname": "Helvetica",
    "bgcolor": "#ffffff",
    "pad": "0.5",
    "nodesep": "0.8",
    "ranksep": "0.9",
}

edge_attr = {"fontsize": "9", "fontname": "Helvetica"}
node_attr = {"fontsize": "10", "fontname": "Helvetica"}

with Diagram(
    "Friend Microservices",
    filename="architecture",
    outformat="png",
    show=False,
    direction="TB",
    graph_attr=graph_attr,
    edge_attr=edge_attr,
    node_attr=node_attr,
):
    # --- Write Path ---
    write_api = APIGateway("Write API")
    write_fn = Lambda("writeHandler")
    queue = SQS("frontQueue")
    front_fn = Lambda("frontHandler")

    # --- Storage ---
    table = DynamodbTable("Friend Table")
    stream = DynamodbItems("Stream")

    # --- State Handlers ---
    with Cluster("State Handlers"):
        req_fn = Lambda("request")
        acc_fn = Lambda("accept")
        rej_fn = Lambda("reject")
        unf_fn = Lambda("unfriend")

    # --- DLQ ---
    dlq = SQS("DLQ")

    # --- Read Path ---
    read_api = APIGateway("Read API")
    read_fn = Lambda("readHandler")

    # --- Write flow: straight line down ---
    write_api >> write_fn >> queue >> front_fn >> table

    # --- Stream fans out to state handlers ---
    table >> stream
    stream >> Edge(color="#d97706", style="bold") >> req_fn
    stream >> Edge(color="#059669", style="bold") >> acc_fn
    stream >> Edge(color="#dc2626", style="bold") >> rej_fn
    stream >> Edge(color="#7c3aed", style="bold") >> unf_fn

    # --- State handlers write back (single grouped edge) ---
    [req_fn, acc_fn, rej_fn, unf_fn] >> Edge(style="dashed") >> table

    # --- DLQ (single grouped edge) ---
    [req_fn, acc_fn, rej_fn, unf_fn] >> Edge(style="dotted", color="#ef4444") >> dlq

    # --- Read flow ---
    read_api >> read_fn >> table
